import { useEffect, useMemo, useState } from 'react';
import { buildPreview } from '../lib/preview';
import { Icon, Spinner } from './Icons';

interface PreviewPaneProps {
  files: Record<string, string>;
  entry: string | null;
}

export default function PreviewPane({ files, entry }: PreviewPaneProps) {
  const [nonce, setNonce] = useState(0);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const doc = useMemo(() => buildPreview(files, entry), [files, entry]);

  useEffect(() => {
    if (!doc.entry) {
      setUrl('');
      return;
    }
    const blob = new Blob([doc.html], { type: 'text/html' });
    const next = URL.createObjectURL(blob);
    setUrl(next);
    setLoading(true);
    setErrors([]);
    return () => URL.revokeObjectURL(next);
  }, [doc.html, doc.entry, nonce]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; message?: string } | null;
      if (!data || data.source !== 'codefly-preview' || data.type !== 'error' || !data.message) return;
      setErrors((previous) => [...previous.slice(-2), String(data.message).slice(0, 320)]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const refresh = () => {
    setLoading(true);
    setErrors([]);
    setNonce((value) => value + 1);
  };

  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <div className="preview-entry" title={doc.entry ?? 'No HTML entry file'}>
          <Icon name="eye" size={14} />
          <span>{doc.entry ?? 'no preview'}</span>
        </div>
        <div className="preview-tools">
          <div className="device-toggle" role="group" aria-label="Preview width">
            <button
              className={device === 'desktop' ? 'active' : ''}
              onClick={() => setDevice('desktop')}
              title="Desktop width"
            >
              <Icon name="layers" size={14} />
            </button>
            <button
              className={device === 'phone' ? 'active' : ''}
              onClick={() => setDevice('phone')}
              title="Phone width"
            >
              <Icon name="code" size={14} />
            </button>
          </div>
          <button className="icon-btn" onClick={refresh} title="Reload preview" aria-label="Reload preview">
            <Icon name="refresh" size={15} />
          </button>
          {url ? (
            <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="Open preview in a new tab">
              <Icon name="external" size={15} />
            </a>
          ) : (
            <span className="icon-btn disabled">
              <Icon name="external" size={15} />
            </span>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="preview-errors">
          <Icon name="alert" size={15} />
          <div className="preview-error-copy">
            <strong>Runtime error</strong>
            <span>{errors[errors.length - 1]}</span>
          </div>
          <button className="icon-btn" onClick={() => setErrors([])} aria-label="Dismiss errors">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <div className={'preview-stage ' + device}>
        {doc.entry && url ? (
          <iframe
            key={url}
            className="preview-frame"
            src={url}
            title="Project preview"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
            onLoad={() => setLoading(false)}
          />
        ) : (
          <div className="preview-empty">
            <Icon name="eye" size={26} />
            <strong>Nothing to preview yet</strong>
            <p>Ask the agent to create an index.html and the app will run here.</p>
          </div>
        )}
        {loading && doc.entry && (
          <div className="preview-loading">
            <Spinner size={18} />
            <span>Rendering</span>
          </div>
        )}
      </div>
    </div>
  );
}
