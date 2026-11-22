import type { ChatMessage, ModelInfo, RouteConfig, ToolCall } from '../types';
import { endpointBase } from '../agent/routes';

interface BridgeResponse {
  ok: boolean;
  status: number;
  bodyText: string;
}

declare global {
  interface Window {
    codefly?: {
      request: (payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string | null;
      }) => Promise<BridgeResponse>;
      platform?: string;
      runtime?: string;
      version?: string;
    };
  }
}

export class ProviderError extends Error {
  status: number;
  detail: string;
  routeId: string;

  constructor(message: string, status = 0, detail = '', routeId = '') {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.detail = detail;
    this.routeId = routeId;
  }
}

export function friendlyError(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.status === 0) {
      return error.message;
    }
    if (error.status === 401 || error.status === 403) {
      return 'This route refused the request (HTTP ' + error.status + '). It may now require a key or block this origin. Try another route.';
    }
    if (error.status === 429) {
      return 'Rate limited by the provider (HTTP 429). Free keyless lanes are shared per IP - wait a moment or switch route.';
    }
    if (error.status === 402) {
      return 'The provider reports no remaining free quota (HTTP 402). Switch route.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

async function requestJson(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | null },
): Promise<unknown> {
  const bridge = typeof window !== 'undefined' ? window.codefly : undefined;
  let status = 0;
  let text = '';

  if (bridge && typeof bridge.request === 'function') {
    const response = await bridge.request({
      url,
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body ?? null,
    });
    status = response.status;
    text = response.bodyText;
  } else {
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: init.headers,
        body: init.body ?? undefined,
      });
    } catch (error) {
      throw new ProviderError(
        'Network request failed. The provider may be blocking browser requests (CORS) or you are offline.',
        0,
        String(error),
      );
    }
    status = response.status;
    text = await response.text();
  }

  if (status < 200 || status >= 300) {
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string } | string;
        message?: string;
        detail?: string;
      };
      if (typeof parsed.error === 'string') detail = parsed.error;
      else if (parsed.error && parsed.error.message) detail = parsed.error.message;
      else if (parsed.message) detail = parsed.message;
      else if (parsed.detail) detail = parsed.detail;
    } catch {
      /* keep the raw text */
    }
    throw new ProviderError('HTTP ' + status + ': ' + detail, status, text.slice(0, 2000));
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError('The provider returned a non-JSON response.', status, text.slice(0, 500));
  }
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((call, index) => {
      if (!call || typeof call !== 'object') return null;
      const item = call as {
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      };
      const name = item.function && item.function.name;
      if (!name) return null;
      return {
        id: item.id || 'call_' + index + '_' + Date.now(),
        type: 'function' as const,
        function: {
          name,
          arguments: item.function && item.function.arguments ? item.function.arguments : '{}',
        },
      };
    })
    .filter((call): call is ToolCall => call !== null);
}

export interface ChatOptions {
  route: RouteConfig;
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatOutput {
  text: string;
  model: string;
  toolCalls: ToolCall[];
  finishReason: string;
}

export async function chatCompletion(options: ChatOptions): Promise<ChatOutput> {
  const base = endpointBase(options.route).replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.route.headers ?? {}),
  };

  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: false,
    temperature: options.temperature ?? 0.35,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  let data: {
    model?: string;
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: unknown; tool_calls?: unknown };
    }>;
  };

  try {
    data = (await requestJson(base + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })) as typeof data;
  } catch (error) {
    if (error instanceof ProviderError) error.routeId = options.route.id;
    throw error;
  }

  const choice = (data.choices && data.choices[0]) || {};
  const message = choice.message || {};
  const text = flattenContent(message.content).trim();

  return {
    text,
    model: data.model || options.model,
    toolCalls: normalizeToolCalls(message.tool_calls),
    finishReason: choice.finish_reason || 'stop',
  };
}

function normalizeModel(raw: unknown): ModelInfo {
  const item = (raw || {}) as {
    id?: string;
    name?: string;
    display_name?: string;
    context_length?: number;
    contextLength?: number;
    isFree?: boolean;
    free?: boolean;
    supported_parameters?: string[];
  };
  const id = String(item.id || item.name || '');
  return {
    id,
    name: String(item.name || item.display_name || id),
    contextLength:
      Number(item.context_length || item.contextLength || 0) || undefined,
    free: Boolean(item.isFree || item.free || /:free$/i.test(id)),
    tools: Array.isArray(item.supported_parameters)
      ? item.supported_parameters.includes('tools')
      : undefined,
  };
}

export async function fetchModels(route: RouteConfig): Promise<ModelInfo[]> {
  const base = endpointBase(route).replace(/\/+$/, '');
  try {
    const data = (await requestJson(base + '/models', {
      method: 'GET',
      headers: { ...(route.headers ?? {}) },
    })) as { data?: unknown[]; models?: unknown[] };

    const raw = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.models)
        ? data.models
        : [];

    const models = raw
      .map(normalizeModel)
      .filter((model) => Boolean(model.id) && model.id.length < 120);

    if (models.length === 0) return route.fallbackModels;

    const seen = new Set<string>();
    const unique = models.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });

    return unique.slice(0, 200);
  } catch {
    return route.fallbackModels;
  }
}
