/**
 * Parser for the JSON action protocol used by routes without native tool
 * calling (Pollinations today, any future route that lacks `tools`).
 *
 * Models are not reliable JSON emitters, so this accepts code fences, leading
 * chatter, trailing commas and both common key spellings.
 */

export interface ParsedReply {
  thought?: string;
  tool?: string;
  input?: Record<string, unknown>;
  final?: string;
}

const TOOL_KEYS = ['action', 'tool', 'name', 'function'];
const INPUT_KEYS = ['action_input', 'actionInput', 'args', 'arguments', 'parameters', 'input'];
const FINAL_KEYS = ['final', 'answer', 'summary', 'message', 'response'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Strip markdown fences and isolate the first balanced JSON object. */
function extractJsonObject(raw: string): string | null {
  let text = raw.trim();

  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) text = fenced[1].trim();

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function repairJson(text: string): string {
  return text
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/}\s*{/g, '},{');
}

function parseObject(text: string): Record<string, unknown> | null {
  for (const candidate of [text, repairJson(text)]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (isRecord(value)) return value;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function parseAgentReply(raw: string): ParsedReply | null {
  if (!raw || !raw.trim()) return null;

  const json = extractJsonObject(raw);
  if (!json) return null;

  const object = parseObject(json);
  if (!object) return null;

  const thought = pickString(object, ['thought', 'reasoning', 'thinking']);

  // A nested "function" object is accepted too: {"function":{"name":..,"arguments":..}}
  const nested = isRecord(object.function) ? object.function : null;

  let tool = pickString(object, TOOL_KEYS) ?? (nested ? pickString(nested, ['name', 'tool']) : undefined);
  let input: Record<string, unknown> = {};

  for (const key of INPUT_KEYS) {
    const value = object[key];
    if (isRecord(value)) {
      input = value;
      break;
    }
  }
  if (Object.keys(input).length === 0 && nested) {
    for (const key of INPUT_KEYS) {
      const value = nested[key];
      if (isRecord(value)) {
        input = value;
        break;
      }
    }
  }

  if (tool && tool.toLowerCase() === 'finish') {
    const summary =
      pickString(input, ['summary', 'message', 'result']) ??
      pickString(object, ['summary', 'final', 'answer']) ??
      'Done.';
    return { thought, tool: 'finish', input: { summary }, final: summary };
  }

  if (tool) {
    return { thought, tool, input };
  }

  const final = pickString(object, FINAL_KEYS);
  if (final) return { thought, final };

  // Some models put the summary under action_input when action is "finish"
  // (handled above) or use {"done": true, "summary": "..."}.
  if (object.done === true) {
    return { thought, final: pickString(object, FINAL_KEYS) ?? 'Done.' };
  }

  return null;
}
