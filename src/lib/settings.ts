import type { AppSettings } from '../types';

const SETTINGS_KEY = 'codefly.settings.v1';

export const DEFAULT_SETTINGS: AppSettings = {
  maxTurns: 16,
  temperature: 0.35,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      maxTurns: clamp(Number(parsed.maxTurns) || DEFAULT_SETTINGS.maxTurns, 4, 40),
      temperature: clamp(
        typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_SETTINGS.temperature,
        0,
        1,
      ),
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
