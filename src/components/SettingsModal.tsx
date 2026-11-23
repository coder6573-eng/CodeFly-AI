import { useEffect } from 'react';
import type { AppSettings, ModelInfo, RouteId } from '../types';
import { ROUTES, getRoute } from '../agent/routes';
import { Icon, Spinner } from './Icons';

interface SettingsModalProps {
  open: boolean;
  routeId: RouteId;
  model: string | null;
  models: ModelInfo[];
  loadingModels: boolean;
  settings: AppSettings;
  onClose: () => void;
  onRoute: (id: RouteId) => void;
  onModel: (id: string | null) => void;
  onRefreshModels: () => void;
  onSettings: (settings: AppSettings) => void;
}

export default function SettingsModal({
  open,
  routeId,
  model,
  models,
  loadingModels,
  settings,
  onClose,
  onRoute,
  onModel,
  onRefreshModels,
  onSettings,
}: SettingsModalProps) {
  const route = getRoute(routeId);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const seen = new Set<string>();
  const modelOptions = [...route.fallbackModels, ...models].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="modal-head">
          <div>
            <h2>Flight settings</h2>
            <p>Pick the model route and tune how the agent runs.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-section">
            <div className="settings-title">
              <span>AI route</span>
              <a href={route.docs} target="_blank" rel="noreferrer" className="link-btn">
                Docs <Icon name="external" size={12} />
              </a>
            </div>
            <div className="route-grid">
              {ROUTES.map((item) => (
                <button
                  key={item.id}
                  className={'route-card' + (item.id === routeId ? ' active' : '')}
                  onClick={() => onRoute(item.id)}
                >
                  <span className="route-card-top">
                    <span className="route-card-name">{item.label}</span>
                    {item.id === routeId && <Icon name="check" size={14} />}
                  </span>
                  <span className="route-card-desc">{item.description}</span>
                  <span className="route-card-tags">
                    <span className={'tag ' + (item.supportsTools ? 'good' : 'warn')}>
                      {item.supportsTools ? 'native tools' : 'JSON actions'}
                    </span>
                    <span className="tag">keyless</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="settings-note">
              <Icon name="alert" size={13} /> {route.note}
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-title">
              <span>Model</span>
              <button className="link-btn" onClick={onRefreshModels} disabled={loadingModels}>
                {loadingModels ? <Spinner size={12} /> : <Icon name="refresh" size={12} />}
                {loadingModels ? 'Loading' : 'Refresh list'}
              </button>
            </div>
            <div className="select-wrap">
              <select
                value={model ?? ''}
                onChange={(event) => onModel(event.target.value || null)}
                aria-label="Model"
              >
                <option value="">Route default · {route.defaultModel}</option>
                {modelOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.id !== item.name ? ' — ' + item.id : ''}
                    {item.tools === false ? ' (no tools)' : ''}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={15} />
            </div>
            <p className="settings-note">
              Pinning a model keeps output consistent. Auto routes may resolve to a different model between calls.
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-title">
              <span>Run limits</span>
              <span className="settings-value">{settings.maxTurns} steps</span>
            </div>
            <label className="range-row">
              <span>Maximum agent steps</span>
              <input
                type="range"
                min={4}
                max={40}
                step={1}
                value={settings.maxTurns}
                onChange={(event) => onSettings({ ...settings, maxTurns: Number(event.target.value) })}
              />
            </label>
            <label className="range-row">
              <span>Temperature</span>
              <span className="settings-value">{settings.temperature.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.temperature}
                onChange={(event) => onSettings({ ...settings, temperature: Number(event.target.value) })}
              />
            </label>
            <p className="settings-note">
              Higher temperature explores more; lower is more literal. 0.35 is a good default for code.
            </p>
          </section>
        </div>

        <footer className="modal-foot">
          <span>
            <Icon name="bolt" size={13} /> No API keys, no accounts, no terminal.
          </span>
          <button className="primary-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
