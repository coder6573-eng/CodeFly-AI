export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  free?: boolean;
  tools?: boolean;
}

export type RouteId =
  | 'kilo-auto'
  | 'kilo-free'
  | 'llm7'
  | 'pollinations'
  | 'ovh'
  | 'freeai';

export interface RouteConfig {
  id: RouteId;
  label: string;
  short: string;
  description: string;
  baseUrl: string;
  devBaseUrl?: string;
  defaultModel: string;
  fallbackModels: ModelInfo[];
  headers?: Record<string, string>;
  supportsTools: boolean;
  note: string;
  docs: string;
}

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  model?: string;
  route?: string;
  tools?: number;
  steps?: string[];
  error?: boolean;
  at: number;
}

export interface Project {
  id: string;
  name: string;
  files: Record<string, string>;
  routeId: RouteId;
  model: string | null;
  chat: ChatEntry[];
  createdAt: number;
  updatedAt: number;
}

export type AgentEvent =
  | { type: 'status'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'tool'; name: string; detail: string; ok?: boolean }
  | { type: 'file'; path: string; action: 'create' | 'edit' | 'delete' | 'rename'; from?: string }
  | { type: 'model'; model: string; route: RouteId }
  | { type: 'error'; message: string };

export interface AgentResult {
  files: Record<string, string>;
  resolvedModel: string;
  summary: string;
  turns: number;
  toolCalls: number;
  usedJsonProtocol: boolean;
  finishReason: 'done' | 'limit' | 'stopped';
}

export interface AppSettings {
  maxTurns: number;
  temperature: number;
  autoPreview: boolean;
}
