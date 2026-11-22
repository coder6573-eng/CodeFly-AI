import type { ModelInfo, RouteConfig, RouteId } from '../types';

const KILO = 'https://ai-gateway.kilo.ai/api/v1';

/**
 * Six cloud-only, keyless routes.
 *
 * Kilo Auto is the default: the gateway picks the best free model server-side
 * (200 requests/hour per IP anonymously). The rest are direct endpoints, so a
 * user can pin an exact model when they want determinism.
 */
export const ROUTES: RouteConfig[] = [
  {
    id: 'kilo-auto',
    label: 'Kilo Auto',
    short: 'Auto',
    description:
      'Kilo Gateway auto-router. Picks the best available free model per request, server-side.',
    baseUrl: KILO,
    devBaseUrl: '/gw/kilo',
    defaultModel: 'kilo-auto/free',
    supportsTools: true,
    note: 'Free tier, anonymous, 200 req/hour per IP. The resolved model may change between calls.',
    docs: 'https://kilo.ai/docs/code-with-ai/agents/auto-model',
    fallbackModels: [
      { id: 'kilo-auto/free', name: 'Kilo Auto Free (server-routed)', free: true, tools: true },
    ],
  },
  {
    id: 'kilo-free',
    label: 'Kilo Free Models',
    short: 'Kilo',
    description:
      'Direct access to every :free model in the Kilo catalog. Pin an exact model instead of routing.',
    baseUrl: KILO,
    devBaseUrl: '/gw/kilo',
    defaultModel: 'minimax/minimax-m2.1:free',
    supportsTools: true,
    note: 'Same gateway, no router. Free models are rate limited by the upstream provider.',
    docs: 'https://kilo.ai/docs/gateway/models-and-providers',
    fallbackModels: [
      { id: 'minimax/minimax-m2.1:free', name: 'MiniMax M2.1 (free)', free: true, tools: true },
      { id: 'z-ai/glm-5:free', name: 'GLM-5 (free)', free: true, tools: true },
      { id: 'deepseek/deepseek-v3.2:free', name: 'DeepSeek V3.2 (free)', free: true, tools: true },
    ],
  },
  {
    id: 'llm7',
    label: 'LLM7',
    short: 'LLM7',
    description:
      'OpenAI-compatible gateway with an anonymous tier. The literal token "unused" is the documented anonymous key.',
    baseUrl: 'https://api.llm7.io/v1',
    devBaseUrl: '/gw/llm7',
    defaultModel: 'gpt-4.1-nano-2025-04-14',
    supportsTools: true,
    headers: { Authorization: 'Bearer unused' },
    note: 'About 30 requests/minute anonymously. Tool support varies by model.',
    docs: 'https://api.llm7.io',
    fallbackModels: [
      { id: 'gpt-4.1-nano-2025-04-14', name: 'GPT-4.1 nano', free: true, tools: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', free: true, tools: true },
    ],
  },
  {
    id: 'pollinations',
    label: 'Pollinations',
    short: 'Poll',
    description:
      'Keyless text endpoint. Very fast and reliable, but the model does not support native tool calling.',
    baseUrl: 'https://text.pollinations.ai/openai',
    devBaseUrl: '/gw/pollinations',
    defaultModel: 'openai-fast',
    supportsTools: false,
    note: 'No tool calling, so CodeFly switches to the JSON action protocol automatically.',
    docs: 'https://github.com/pollinations/pollinations',
    fallbackModels: [{ id: 'openai-fast', name: 'OpenAI Fast (keyless)', free: true, tools: false }],
  },
  {
    id: 'ovh',
    label: 'OVHcloud AI Endpoints',
    short: 'OVH',
    description:
      'EU-hosted serverless open models. Anonymous lane needs no key or signup.',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    devBaseUrl: '/gw/ovh',
    defaultModel: 'gpt-oss-120b',
    supportsTools: true,
    note: 'Anonymous lane is roughly 2 requests/minute per IP per model. 429 means slow down, not outage.',
    docs: 'https://endpoints.ai.cloud.ovh.net/',
    fallbackModels: [
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', free: true, tools: true },
      { id: 'Qwen3.6-27B', name: 'Qwen3.6 27B', free: true, tools: true },
      { id: 'DeepSeek-V4.1-Flash-1017', name: 'DeepSeek V4.1 Flash', free: true, tools: true },
    ],
  },
  {
    id: 'freeai',
    label: 'Free.ai',
    short: 'Free.ai',
    description:
      'Self-hosted open models behind an OpenAI-compatible API. Works without a key on self-hosted ids.',
    baseUrl: 'https://api.free.ai/v1',
    devBaseUrl: '/gw/freeai',
    defaultModel: 'qwen-coder',
    supportsTools: true,
    note: 'The served backend may differ from the requested id. CodeFly always shows the model the response reports.',
    docs: 'https://free.ai/api/',
    fallbackModels: [
      { id: 'qwen-coder', name: 'Qwen Coder', free: true, tools: true },
      { id: 'qwen3-8b', name: 'Qwen3 8B', free: true, tools: true },
      { id: 'deepseek-r1', name: 'DeepSeek R1', free: true, tools: true },
      { id: 'mistral', name: 'Mistral', free: true, tools: true },
    ],
  },
];

export const DEFAULT_ROUTE: RouteId = 'kilo-auto';

export function getRoute(id: string | null | undefined): RouteConfig {
  return ROUTES.find((route) => route.id === id) ?? ROUTES[0];
}

export function endpointBase(route: RouteConfig): string {
  const useDevProxy = Boolean(import.meta.env && import.meta.env.DEV);
  return useDevProxy && route.devBaseUrl ? route.devBaseUrl : route.baseUrl;
}

export function modelLabel(models: ModelInfo[], id: string | null): string {
  if (!id) return 'Auto (route default)';
  const found = models.find((model) => model.id === id);
  return found ? found.name : id;
}
