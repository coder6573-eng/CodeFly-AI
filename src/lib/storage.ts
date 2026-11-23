import { DEFAULT_ROUTE, ROUTES } from '../agent/routes';
import type { AppSettings, ChatEntry, Project, RouteId } from '../types';

const PROJECTS_KEY = 'codefly.projects.v1';
const ACTIVE_KEY = 'codefly.active.v1';
const SETTINGS_KEY = 'codefly.settings.v1';

export const DEFAULT_SETTINGS: AppSettings = {
  maxTurns: 16,
  temperature: 0.35,
  autoPreview: true,
};

export function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
}

export function newProject(name: string): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    files: {},
    routeId: DEFAULT_ROUTE,
    model: null,
    chat: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isRouteId(value: unknown): value is RouteId {
  return typeof value === 'string' && ROUTES.some((route) => route.id === value);
}

function isChatEntry(value: unknown): value is ChatEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ChatEntry>;
  return (
    typeof entry.id === 'string' &&
    (entry.role === 'user' || entry.role === 'assistant' || entry.role === 'system') &&
    typeof entry.text === 'string' &&
    typeof entry.at === 'number'
  );
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<Project>;
  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.files === 'object' &&
    project.files !== null &&
    !Array.isArray(project.files) &&
    Object.values(project.files).every((content) => typeof content === 'string') &&
    isRouteId(project.routeId) &&
    (project.model === null || typeof project.model === 'string') &&
    Array.isArray(project.chat) &&
    project.chat.every(isChatEntry) &&
    typeof project.createdAt === 'number' &&
    typeof project.updatedAt === 'number'
  );
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProject);
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    /* storage may be full or blocked */
  }
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      maxTurns: clampInt(parsed.maxTurns, 2, 40, DEFAULT_SETTINGS.maxTurns),
      temperature: clampNumber(parsed.temperature, 0, 1, DEFAULT_SETTINGS.temperature),
      autoPreview:
        typeof parsed.autoPreview === 'boolean' ? parsed.autoPreview : DEFAULT_SETTINGS.autoPreview,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
