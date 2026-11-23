import { useEffect, useState } from 'react';
import { ROUTES, getRoute } from '../agent/routes';
import { fetchModels } from '../lib/transport';
import type { ModelInfo, RouteId } from '../types';

interface RoutePickerProps {
  routeId: RouteId;
  model: string | null;
  onChange: (routeId: RouteId, model: string | null) => void;
}

export default function RoutePicker({ routeId, model, onChange }: RoutePickerProps) {
  const route = getRoute(routeId);
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (models[routeId]) return;
    let cancelled = false;
    setLoading(true);
    fetchModels(getRoute(routeId))
      .then((list) => {
        if (!cancelled) setModels((previous) => ({ ...previous, [routeId]: list }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, models]);

  const available = models[routeId] ?? route.fallbackModels;
  const missing = model && !available.some((item) => item.id === model);

  return (
    <div className="route-picker" title={route.description + '\n\n' + route.note}>
      <select
        aria-label="AI route"
        value={routeId}
        onChange={(event) => onChange(event.target.value as RouteId, null)}
      >
        {ROUTES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Model"
        value={model ?? ''}
        onChange={(event) => onChange(routeId, event.target.value || null)}
      >
        <option value="">{loading ? 'Loading models…' : 'Auto · route default'}</option>
        {missing && model ? <option value={model}>{model}</option> : null}
        {available.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.tools === false ? ' (no tools)' : ''}
          </option>
        ))}
      </select>
      <span
        className={'route-badge' + (route.supportsTools ? '' : ' route-badge-json')}
        title={route.supportsTools ? 'Native tool calling' : 'Uses the JSON action protocol'}
      >
        {route.short}
      </span>
    </div>
  );
}
