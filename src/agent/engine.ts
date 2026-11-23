import { chatCompletion } from '../lib/transport';
import type { AgentEvent, AgentResult, ChatEntry, ChatMessage, RouteConfig } from '../types';
import { parseAgentReply } from './jsonProtocol';
import {
  buildSystemPrompt,
  buildUserPrompt,
  JSON_CORRECTION_TEXT,
  NUDGE_TEXT,
} from './prompts';
import { AGENT_TOOLS, Workspace, executeTool, type ToolOutcome } from './tools';

const DEFAULT_MAX_TURNS = 16;
const MAX_TOOL_CALLS = 80;
const MAX_TOKENS = 8_000;

export class AgentStoppedError extends Error {
  constructor() {
    super('Stopped by user.');
    this.name = 'AbortError';
  }
}

export interface RunAgentOptions {
  route: RouteConfig;
  model: string | null;
  goal: string;
  files: Record<string, string>;
  history?: ChatEntry[];
  maxTurns?: number;
  temperature?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  onSnapshot?: (files: Record<string, string>) => void;
}

interface PendingCall {
  id: string;
  name: string;
  args: unknown;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AgentStoppedError();
}

/** Only the conversational part of previous runs is replayed; tool traffic is not. */
function historyMessages(entries: ChatEntry[]): ChatMessage[] {
  return entries
    .filter((entry) => entry.role !== 'system' && !entry.error)
    .slice(-6)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.text.slice(0, 1_500),
    }));
}

function parseArguments(raw: string): unknown {
  if (!raw || !raw.trim()) return {};
  const candidates = [raw, raw.replace(/,\s*([}\]])/g, '$1')];
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return parsed;
    } catch {
      /* try the repaired candidate */
    }
  }
  return {};
}

/**
 * Keep long runs inside model context limits without breaking tool-call
 * pairing: only the text of old tool observations is shortened.
 */
function shrinkMessages(messages: ChatMessage[]): void {
  const cutoff = messages.length - 8;
  for (let index = 0; index < cutoff; index += 1) {
    const message = messages[index];
    if (message.role === 'tool' && message.content.length > 700) {
      message.content = message.content.slice(0, 700) + '\n... [older observation trimmed]';
    }
    if (message.role === 'assistant' && message.content.length > 1_200) {
      message.content = message.content.slice(0, 1_200) + '...';
    }
  }
}

function describe(name: string, args: Record<string, unknown>, outcome: ToolOutcome): string {
  const path = typeof args.path === 'string' ? args.path : '';
  const from = typeof args.from === 'string' ? args.from : '';
  const to = typeof args.to === 'string' ? args.to : '';

  if (!outcome.ok) return 'Failed: ' + outcome.observation.replace(/^Error:\s*/, '').slice(0, 140);

  switch (name) {
    case 'write_file': {
      const change = outcome.changes[0];
      return (change?.action === 'create' ? 'Created ' : 'Updated ') + (change?.path ?? path);
    }
    case 'edit_file': {
      const count = outcome.changes.length ? outcome.observation.match(/replaced (\d+)/)?.[1] : '';
      return 'Edited ' + path + (count ? ' (' + count + ' replacement' + (count === '1' ? '' : 's') + ')' : '');
    }
    case 'delete_file':
      return 'Deleted ' + path;
    case 'rename_file':
      return 'Renamed ' + from + ' -> ' + to;
    case 'read_file':
      return 'Read ' + path;
    case 'list_files':
      return 'Listed workspace files';
    case 'finish':
      return 'Finished';
    default:
      return name;
  }
}

function defaultSummary(workspace: Workspace, reason: AgentResult['finishReason']): string {
  const paths = workspace.paths();
  if (paths.length === 0) {
    return reason === 'limit'
      ? 'Stopped before any files were written. Try again or switch routes.'
      : 'No changes were made.';
  }
  const shown = paths.slice(0, 6).join(', ');
  const extra = paths.length > 6 ? ` and ${paths.length - 6} more` : '';
  return `Updated ${paths.length} file${paths.length === 1 ? '' : 's'}: ${shown}${extra}.`;
}

export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const route = options.route;
  const workspace = new Workspace(options.files);
  const emit = (event: AgentEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      /* UI callbacks must never break a run */
    }
  };
  const snapshot = (): void => {
    try {
      options.onSnapshot?.({ ...workspace.files });
    } catch {
      /* ignore */
    }
  };

  let native = route.supportsTools;
  let usedJsonProtocol = !native;
  let resolvedModel = options.model || route.defaultModel;
  let turns = 0;
  let toolCalls = 0;
  let nudges = 0;
  let parseFailures = 0;
  let lastText = '';

  const maxTurns = Math.max(2, Math.min(40, Math.round(options.maxTurns ?? DEFAULT_MAX_TURNS)));
  const requestedModel = options.model || route.defaultModel;

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(native ? 'native' : 'json', workspace) },
    ...historyMessages(options.history ?? []),
    { role: 'user', content: buildUserPrompt(options.goal) },
  ];

  const isReady = (): boolean => workspace.paths().length > 0 && workspace.has('index.html');

  const finish = (summary: string, reason: AgentResult['finishReason']): AgentResult => {
    snapshot();
    const files = { ...workspace.files };
    const text = summary.trim() || defaultSummary(workspace, reason);
    return {
      files,
      resolvedModel,
      summary: text,
      turns,
      toolCalls,
      usedJsonProtocol,
      finishReason: reason,
    };
  };

  const emitOutcome = (name: string, args: unknown, outcome: ToolOutcome): void => {
    emit({
      type: 'tool',
      name,
      detail: describe(name, args && typeof args === 'object' ? (args as Record<string, unknown>) : {}, outcome),
      ok: outcome.ok,
    });
    for (const change of outcome.changes) {
      emit({ type: 'file', path: change.path, action: change.action, from: change.from });
    }
  };

  emit({ type: 'status', text: 'Preparing workspace' });

  while (turns < maxTurns) {
    throwIfAborted(options.signal);
    turns += 1;
    emit({ type: 'status', text: `Step ${turns} of ${maxTurns} - thinking` });

    shrinkMessages(messages);

    const output = await chatCompletion({
      route,
      model: requestedModel,
      messages,
      tools: native ? AGENT_TOOLS : undefined,
      temperature: options.temperature ?? 0.35,
      maxTokens: MAX_TOKENS,
      signal: options.signal,
    });

    if (output.model && output.model !== resolvedModel) {
      resolvedModel = output.model;
      emit({ type: 'model', model: resolvedModel, route: route.id });
    }

    const text = output.text || '';
    if (text) lastText = text;

    let pending: PendingCall[] = [];
    if (native) {
      pending = output.toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        args: parseArguments(call.function.arguments),
      }));
      if (text) emit({ type: 'assistant', text });
    }

    // ---- Native tool-calling path -------------------------------------------------
    if (native && pending.length > 0 && output.toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: text, tool_calls: output.toolCalls });

      for (const call of pending) {
        throwIfAborted(options.signal);
        toolCalls += 1;
        const argsRecord = call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {};
        const outcome = executeTool(workspace, call.name, call.args);
        emitOutcome(call.name, argsRecord, outcome);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: outcome.observation,
        });

        if (outcome.finished) {
          return finish(outcome.finished.summary, 'done');
        }
      }

      snapshot();
      if (toolCalls >= MAX_TOOL_CALLS) {
        emit({ type: 'status', text: 'Tool budget reached' });
        return finish(lastText, 'limit');
      }
      continue;
    }

    // ---- JSON action path (also the automatic fallback) --------------------------
    const parsed = parseAgentReply(text);

    if (parsed && parsed.tool) {
      if (native) {
        native = false;
        usedJsonProtocol = true;
      }
      if (parsed.thought) emit({ type: 'assistant', text: parsed.thought });
      messages.push({ role: 'assistant', content: text });

      toolCalls += 1;
      const input = parsed.input ?? {};
      const outcome = executeTool(workspace, parsed.tool, input);
      emitOutcome(parsed.tool, input, outcome);
      messages.push({
        role: 'user',
        content: `Observation from ${parsed.tool}:\n${outcome.observation}`,
      });

      if (outcome.finished) {
        return finish(outcome.finished.summary, 'done');
      }

      snapshot();
      parseFailures = 0;
      if (toolCalls >= MAX_TOOL_CALLS) {
        emit({ type: 'status', text: 'Tool budget reached' });
        return finish(lastText, 'limit');
      }
      continue;
    }

    if (parsed && parsed.final !== undefined) {
      if (!isReady()) {
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content:
            'You cannot finish yet: ' +
            (workspace.paths().length === 0 ? 'the workspace is empty.' : 'index.html is missing from the project root.') +
            ' ' +
            NUDGE_TEXT,
        });
        nudges += 1;
        if (nudges > 3) return finish(lastText, 'limit');
        continue;
      }
      return finish(parsed.final, 'done');
    }

    // ---- No usable action --------------------------------------------------------
    if (native) {
      nudges += 1;
      if (text.trim()) messages.push({ role: 'assistant', content: text });
      if (nudges > 1 && isReady() && text.trim()) {
        return finish(text, 'done');
      }
      messages.push({ role: 'user', content: NUDGE_TEXT });
      if (nudges > 3) return finish(lastText, 'limit');
      continue;
    }

    parseFailures += 1;
    if (parseFailures > 2) {
      return finish(text || lastText, 'limit');
    }
    if (text.trim()) messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: JSON_CORRECTION_TEXT });
  }

  emit({ type: 'status', text: 'Step limit reached' });
  return finish(lastText, 'limit');
}
