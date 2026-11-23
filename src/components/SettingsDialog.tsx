import { useState } from 'react';
import type { AppSettings } from '../types';

interface SettingsDialogProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

export default function SettingsDialog({ settings, onSave, onClose }: SettingsDialogProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">
              Max agent steps <em>{draft.maxTurns}</em>
            </span>
            <input
              type="range"
              min={2}
              max={40}
              step={1}
              value={draft.maxTurns}
              onChange={(event) => setDraft({ ...draft, maxTurns: Number(event.target.value) })}
            />
            <span className="field-hint">How many model turns a single run may take.</span>
          </label>

          <label className="field">
            <span className="field-label">
              Temperature <em>{draft.temperature.toFixed(2)}</em>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.temperature}
              onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })}
            />
            <span className="field-hint">Lower is more deterministic, higher is more creative.</span>
          </label>

          <label className="field field-check">
            <input
              type="checkbox"
              checked={draft.autoPreview}
              onChange={(event) => setDraft({ ...draft, autoPreview: event.target.checked })}
            />
            <span>
              Auto-refresh the preview after each agent step
            </span>
          </label>

          <label className="field field-check">
            <input
              type="checkbox"
              checked={draft.showThinking}
              onChange={(event) => setDraft({ ...draft, showThinking: event.target.checked })}
            />
            <span>
              Show the model's thinking when the provider exposes it
            </span>
          </label>
        </div>

        <footer className="modal-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="run-button" onClick={() => onSave(draft)}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
