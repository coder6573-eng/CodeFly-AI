/**
 * The agent's only way to touch the world.
 *
 * CodeFly is deliberately terminal-free: the model cannot run commands or read
 * the disk. It can only mutate the in-memory workspace through these tools.
 * Every tool is pure and synchronous, which makes runs deterministic and easy
 * to snapshot for the live preview.
 */

const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 6_000_000;
const MAX_FILES = 300;
const MAX_READ_CHARS = 16_000;

export interface FileChange {
  path: string;
  action: 'create' | 'edit' | 'delete' | 'rename';
  from?: string;
}

export interface FinishPayload {
  summary: string;
}

export interface ToolOutcome {
  ok: boolean;
  observation: string;
  changes: FileChange[];
  finished?: FinishPayload;
}

export const TOOL_NAMES = [
  'list_files',
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'rename_file',
  'finish',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Project paths are virtual and must stay inside the workspace: no absolute
 * paths, no drive letters, no `..` segments.
 */
export function normalizePath(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/\\/g, '/')
    .trim();

  if (!cleaned) throw new Error('The path is empty.');
  if (cleaned.startsWith('/')) throw new Error('Paths must be relative to the project root (no leading "/").');
  if (/^[a-zA-Z]:/.test(cleaned)) throw new Error('Absolute drive paths are not allowed.');

  const parts: string[] = [];
  for (const part of cleaned.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') throw new Error('Path traversal ("..") is not allowed.');
    if (part.length > 100) throw new Error('A path segment is too long.');
    parts.push(part);
  }

  const path = parts.join('/');
  if (!path) throw new Error('The path is empty.');
  if (path.length > 240) throw new Error('The path is too long.');

  return path;
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index + 1);
}

export class Workspace {
  files: Record<string, string>;

  constructor(files: Record<string, string> = {}) {
    this.files = { ...files };
  }

  paths(): string[] {
    return Object.keys(this.files).sort((a, b) => a.localeCompare(b));
  }

  totalBytes(): number {
    return Object.values(this.files).reduce((sum, content) => sum + byteLength(content), 0);
  }

  listText(): string {
    const paths = this.paths();
    if (paths.length === 0) return '(the workspace is empty - create index.html first)';
    const lines = paths.map((path) => `- ${path} (${byteLength(this.files[path])} bytes)`);
    return [`${paths.length} files, ${this.totalBytes()} bytes total:`, ...lines].join('\n');
  }

  has(path: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, path);
  }

  read(rawPath: string): string {
    const path = normalizePath(rawPath);
    if (!this.has(path)) {
      throw new Error(`File not found: ${path}. Call list_files to see what exists.`);
    }
    return this.files[path];
  }

  write(rawPath: string, content: string): FileChange {
    const path = normalizePath(rawPath);
    if (typeof content !== 'string') throw new Error('content must be a string.');
    if (content.includes('\u0000')) throw new Error('Refusing to write binary content. CodeFly projects are text-only.');

    const bytes = byteLength(content);
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(
        `That file would be ${bytes} bytes; the per-file limit is ${MAX_FILE_BYTES}. Split it into smaller files.`,
      );
    }

    const existed = this.has(path);
    if (!existed && this.paths().length >= MAX_FILES) {
      throw new Error(`The project already has ${MAX_FILES} files. Delete something before adding more.`);
    }

    const others = Object.entries(this.files)
      .filter(([key]) => key !== path)
      .reduce((sum, [, value]) => sum + byteLength(value), 0);
    if (others + bytes > MAX_TOTAL_BYTES) {
      throw new Error(`That would push the project over the ${MAX_TOTAL_BYTES} byte limit.`);
    }

    this.files[path] = content;
    return { path, action: existed ? 'edit' : 'create' };
  }

  edit(rawPath: string, oldString: string, newString: string, replaceAll: boolean): { change: FileChange; replacements: number } {
    const path = normalizePath(rawPath);
    if (!this.has(path)) throw new Error(`File not found: ${path}. Create it with write_file first.`);
    if (typeof oldString !== 'string' || oldString.length === 0) {
      throw new Error('old_string must be a non-empty exact snippet from the file.');
    }
    if (typeof newString !== 'string') throw new Error('new_string must be a string.');

    const current = this.files[path];
    const occurrences = current.split(oldString).length - 1;

    if (occurrences === 0) {
      throw new Error(
        'old_string was not found in ' + path + '. Call read_file and copy the exact text, including indentation.',
      );
    }
    if (occurrences > 1 && !replaceAll) {
      throw new Error(
        `old_string appears ${occurrences} times in ${path}. Add surrounding context to make it unique, or set replace_all to true.`,
      );
    }

    const next = replaceAll ? current.split(oldString).join(newString) : current.replace(oldString, newString);
    const change = this.write(path, next);
    return { change, replacements: occurrences };
  }

  remove(rawPath: string): FileChange {
    const path = normalizePath(rawPath);
    if (!this.has(path)) throw new Error(`File not found: ${path}.`);
    delete this.files[path];
    return { path, action: 'delete' };
  }

  rename(rawFrom: string, rawTo: string): FileChange {
    const from = normalizePath(rawFrom);
    const to = normalizePath(rawTo);
    if (!this.has(from)) throw new Error(`File not found: ${from}.`);
    if (this.has(to)) throw new Error(`Target already exists: ${to}.`);
    if (from === to) return { path: to, action: 'rename', from };

    this.files[to] = this.files[from];
    delete this.files[from];
    return { path: to, action: 'rename', from };
  }

  /** Directory names referenced by files, useful for prompt outlines. */
  directories(): string[] {
    const dirs = new Set<string>();
    for (const path of this.paths()) {
      const dir = dirOf(path);
      if (dir) dirs.add(dir);
    }
    return [...dirs].sort();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fail(message: string): ToolOutcome {
  return { ok: false, observation: 'Error: ' + message, changes: [] };
}

function ok(observation: string, changes: FileChange[] = []): ToolOutcome {
  return { ok: true, observation, changes };
}

export function executeTool(workspace: Workspace, name: string, rawArgs: unknown): ToolOutcome {
  const args = asRecord(rawArgs);

  try {
    switch (name) {
      case 'list_files':
        return ok(workspace.listText());

      case 'read_file': {
        const path = normalizePath(asString(args.path));
        const content = workspace.read(path);
        const lines = content.split('\n');
        const start = clamp(asInt(args.start_line, 1), 1, Math.max(1, lines.length));
        const end = clamp(asInt(args.end_line, lines.length), start, Math.max(start, lines.length));
        let slice = lines.slice(start - 1, end).join('\n');
        let note = '';
        if (slice.length > MAX_READ_CHARS) {
          slice = slice.slice(0, MAX_READ_CHARS);
          note = `\n... [truncated at ${MAX_READ_CHARS} characters - read a specific line range for more]`;
        }
        return ok(
          `${path} (lines ${start}-${end} of ${lines.length})\n` +
            '```\n' +
            slice +
            '\n```' +
            note,
        );
      }

      case 'write_file': {
        const path = asString(args.path);
        const content = asString(args.content);
        const change = workspace.write(path, content);
        const bytes = byteLength(content);
        return ok(
          `${change.action === 'create' ? 'Created' : 'Overwrote'} ${change.path} (${bytes} bytes, ${content.split('\n').length} lines).`,
          [change],
        );
      }

      case 'edit_file': {
        const path = asString(args.path);
        const oldString = asString(args.old_string);
        const newString = asString(args.new_string);
        const result = workspace.edit(path, oldString, newString, Boolean(args.replace_all));
        return ok(
          `Edited ${path}: replaced ${result.replacements} occurrence${result.replacements === 1 ? '' : 's'}.`,
          [result.change],
        );
      }

      case 'delete_file': {
        const change = workspace.remove(asString(args.path));
        return ok(`Deleted ${change.path}.`, [change]);
      }

      case 'rename_file': {
        const change = workspace.rename(asString(args.from), asString(args.to));
        return ok(`Renamed ${change.from ?? '?'} to ${change.path}.`, [change]);
      }

      case 'finish': {
        if (workspace.paths().length === 0) {
          return fail('The workspace is empty. Build the project before calling finish.');
        }
        if (!workspace.has('index.html')) {
          return fail('index.html is required at the project root before you can finish. Create it now.');
        }
        const summary = asString(args.summary).trim() || 'Done.';
        return { ok: true, observation: 'Task marked complete.', changes: [], finished: { summary } };
      }

      default:
        return fail(
          `Unknown tool "${name}". Use one of: ${TOOL_NAMES.join(', ')}.`,
        );
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function schema(
  name: ToolName,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): unknown {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

/** OpenAI-compatible function definitions for routes that support tools. */
export const AGENT_TOOLS: unknown[] = [
  schema('list_files', 'List every file in the project with its size. Call this first when unsure what exists.', {}),
  schema(
    'read_file',
    'Read a text file. Always read a file before editing it so old_string matches exactly.',
    {
      path: { type: 'string', description: 'Relative path, e.g. index.html or src/app.js' },
      start_line: { type: 'integer', description: 'Optional 1-based first line to read.' },
      end_line: { type: 'integer', description: 'Optional 1-based last line to read (inclusive).' },
    },
    ['path'],
  ),
  schema(
    'write_file',
    'Create a file or replace its entire contents. Use this for new files and full rewrites; prefer edit_file for small changes.',
    {
      path: { type: 'string', description: 'Relative path. Parent folders are implicit.' },
      content: { type: 'string', description: 'Complete file content. No binary data.' },
    },
    ['path', 'content'],
  ),
  schema(
    'edit_file',
    'Replace an exact snippet in an existing file. old_string must match the file character-for-character and, unless replace_all is true, must be unique.',
    {
      path: { type: 'string' },
      old_string: { type: 'string', description: 'Exact snippet to replace, including indentation.' },
      new_string: { type: 'string', description: 'Replacement snippet. Use an empty string to delete the snippet.' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence instead of requiring uniqueness.' },
    },
    ['path', 'old_string', 'new_string'],
  ),
  schema('delete_file', 'Delete a file from the project.', { path: { type: 'string' } }, ['path']),
  schema(
    'rename_file',
    'Move or rename a file. Fails if the destination already exists.',
    { from: { type: 'string' }, to: { type: 'string' } },
    ['from', 'to'],
  ),
  schema(
    'finish',
    'Mark the task complete. Only call this after the project is written, consistent and has a root index.html.',
    { summary: { type: 'string', description: 'Short summary of what was built and how to use it.' } },
    ['summary'],
  ),
];

/** Compact prose catalog used by the JSON fallback protocol. */
export function toolCatalogText(): string {
  return [
    'list_files() -> lists every file and size.',
    'read_file({"path":"index.html","start_line":1,"end_line":200}) -> returns exact file text.',
    'write_file({"path":"index.html","content":"..."}) -> creates or fully overwrites a file.',
    'edit_file({"path":"app.js","old_string":"exact text","new_string":"replacement","replace_all":false}) -> surgical edit.',
    'delete_file({"path":"old.css"}) -> removes a file.',
    'rename_file({"from":"a.js","to":"js/a.js"}) -> renames or moves a file.',
    'finish({"summary":"Built a ..."}) -> ends the run. Requires a root index.html.',
  ].join('\n');
}
