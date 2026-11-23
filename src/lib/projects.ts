import type { ChatEntry, Project } from '../types';
import { DEFAULT_ROUTE } from '../agent/routes';

const PROJECTS_KEY = 'codefly.projects.v1';
const ACTIVE_KEY = 'codefly.active.v1';
const MAX_SAVED_PROJECTS = 30;

export function uid(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return prefix + '_' + random + Date.now().toString(36).slice(-4);
}

export function createEntry(
  role: ChatEntry['role'],
  text: string,
  extra: Partial<ChatEntry> = {},
): ChatEntry {
  return { id: uid('msg'), role, text, at: Date.now(), ...extra };
}

export function createProject(name = 'Untitled project', files: Record<string, string> = {}): Project {
  const now = Date.now();
  return {
    id: uid('prj'),
    name,
    files,
    routeId: DEFAULT_ROUTE,
    model: null,
    chat: [
      createEntry(
        'system',
        'Describe the app you want. CodeFly plans, writes and verifies every file, then runs it in the preview.',
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<Project>;
  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    Boolean(project.files) &&
    typeof project.files === 'object' &&
    Array.isArray(project.chat)
  );
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProject).slice(0, MAX_SAVED_PROJECTS).map((project) => ({
      ...project,
      routeId: project.routeId ?? DEFAULT_ROUTE,
      model: project.model ?? null,
      createdAt: project.createdAt ?? Date.now(),
      updatedAt: project.updatedAt ?? Date.now(),
    }));
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    const ordered = [...projects]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SAVED_PROJECTS);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(ordered));
  } catch {
    /* quota or private mode - the in-memory session still works */
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

export function deriveProjectName(goal: string): string {
  const line = goal.trim().split('\n')[0].replace(/\s+/g, ' ').trim();
  if (!line) return 'Untitled project';
  const cleaned = line.replace(/^(please\s+)?(can you\s+)?(build|make|create|design|code)\s+(me\s+)?(a|an|the)?\s*/i, '');
  const name = (cleaned || line).slice(0, 48).trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Untitled project';
}
