import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { normalizePath } from '../agent/tools';
import { buildPreview, type PreviewDoc } from '../lib/preview';

interface WorkspacePanelProps {
  files: Record<string, string>;
  onFilesChange: (files: Record<string, string>) => void;
  autoPreview: boolean;
  running: boolean;
  exporting: boolean;
  onExport: () => void;
}

export default function WorkspacePanel(props: WorkspacePanelProps) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [previewFiles, setPreviewFiles] = useState<Record<string, string>>(props.files);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileCount = Object.keys(props.files).length;
  const previousCount = useMemo(() => ({ value: fileCount }), []);

  useEffect(() => {
    if (fileCount > 0 && previousCount.value === 0) setTab('preview');
    previousCount.value = fileCount;
  }, [fileCount, previousCount]);

  useEffect(() => {
    if (!props.autoPreview) return;
    const timer = window.setTimeout(() => setPreviewFiles(props.files), 350);
    return () => window.clearTimeout(timer);
  }, [props.files, props.autoPreview]);

  const refresh = () => {
    setPreviewFiles(props.files);
    setRefreshKey((key) => key + 1);
  };

  return (
    <section className="workspace-panel" aria-label="Workspace">
      <div className="workspace-bar">
        <div className="tabs" role="tablist" aria-label="Workspace view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            className={'tab' + (tab === 'preview' ? ' active' : '')}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'code'}
            className={'tab' + (tab === 'code' ? ' active' : '')}
            onClick={() => setTab('code')}
          >
            Code
          </button>
        </div>

        <div className="workspace-actions">
          <span className="file-count">
            {fileCount} file{fileCount === 1 ? '' : 's'}
          </span>
          <button type="button" className="ghost-button" onClick={refresh} disabled={tab !== 'preview'}>
            Refresh
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={props.onExport}
            disabled={props.exporting || fileCount === 0}
          >
            {props.exporting ? 'Zipping…' : 'Export ZIP'}
          </button>
        </div>
      </div>

      <div className="workspace-body">
        {tab === 'preview' ? (
          <PreviewPane files={previewFiles} refreshKey={refreshKey} />
        ) : (
          <CodePane files={props.files} onFilesChange={props.onFilesChange} running={props.running} />
        )}
      </div>
    </section>
  );
}

function PreviewPane({ files, refreshKey }: { files: Record<string, string>; refreshKey: number }) {
  const [doc, setDoc] = useState<PreviewDoc | null>(null);

  useEffect(() => {
    const built = buildPreview(files);
    setDoc(built);
    return () => {
      built?.urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files, refreshKey]);

  if (!doc) {
    return (
      <div className="pane-empty">
        <div className="pane-empty-mark" aria-hidden="true">◻</div>
        <p>No index.html yet.</p>
        <p className="pane-empty-sub">
          Describe an app in the chat and the preview will appear here.
        </p>
      </div>
    );
  }

  return (
    <iframe
      className="preview-frame"
      title="Project preview"
      srcDoc={doc.html}
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
    />
  );
}

function CodePane({
  files,
  onFilesChange,
  running,
}: {
  files: Record<string, string>;
  onFilesChange: (files: Record<string, string>) => void;
  running: boolean;
}) {
  const paths = useMemo(
    () => Object.keys(files).sort((a, b) => a.localeCompare(b)),
    [files],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (selected && Object.prototype.hasOwnProperty.call(files, selected)) return;
    setSelected(paths.includes('index.html') ? 'index.html' : paths[0] ?? null);
  }, [paths, files, selected]);

  const current =
    selected && Object.prototype.hasOwnProperty.call(files, selected) ? files[selected] : null;

  const createFile = () => {
    const candidate = newPath.trim();
    if (!candidate) return;
    let path = '';
    try {
      path = normalizePath(candidate);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Invalid path.');
      return;
    }
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      setError('That file already exists.');
      return;
    }
    onFilesChange({ ...files, [path]: '' });
    setSelected(path);
    setNewPath('');
    setCreating(false);
    setError('');
  };

  const removeFile = (path: string) => {
    if (!window.confirm('Delete ' + path + '?')) return;
    const next = { ...files };
    delete next[path];
    onFilesChange(next);
  };

  return (
    <div className="code-pane">
      <aside className="file-tree" aria-label="Project files">
        <div className="file-tree-head">
          <span>Files</span>
          <button
            type="button"
            className="icon-button"
            title="New file"
            onClick={() => {
              setCreating((value) => !value);
              setError('');
            }}
          >
            ＋
          </button>
        </div>

        {creating ? (
          <div className="new-file">
            <input
              autoFocus
              value={newPath}
              placeholder="path/to/file.js"
              onChange={(event) => setNewPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') createFile();
                if (event.key === 'Escape') {
                  setCreating(false);
                  setNewPath('');
                  setError('');
                }
              }}
            />
            {error ? <div className="new-file-error">{error}</div> : null}
          </div>
        ) : null}

        <ul className="file-list">
          {paths.map((path) => (
            <li key={path} className={'file-row' + (path === selected ? ' active' : '')}>
              <button type="button" className="file-select" onClick={() => setSelected(path)} title={path}>
                <span className="file-icon" aria-hidden="true">{iconFor(path)}</span>
                <span className="file-name">{path}</span>
              </button>
              <button
                type="button"
                className="file-delete"
                title={'Delete ' + path}
                onClick={() => removeFile(path)}
              >
                ×
              </button>
            </li>
          ))}
          {paths.length === 0 ? <li className="file-empty">No files yet</li> : null}
        </ul>
      </aside>

      <div className="editor-wrap">
        {current !== null && selected ? (
          <>
            <div className="editor-head">
              <span className="editor-path">{selected}</span>
              <span className="editor-size">{new Blob([current]).size} bytes</span>
            </div>
            <CodeMirror
              value={current}
              height="100%"
              theme="dark"
              readOnly={running}
              extensions={extensionsFor(selected)}
              onChange={(value) => onFilesChange({ ...files, [selected]: value })}
              className="editor"
            />
          </>
        ) : (
          <div className="pane-empty">
            <p>Select a file to edit it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function iconFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'html' || ext === 'htm') return '◇';
  if (ext === 'css') return '◈';
  if (ext === 'js' || ext === 'mjs' || ext === 'ts' || ext === 'tsx' || ext === 'jsx') return '⚡';
  if (ext === 'json') return '{ }';
  if (ext === 'svg' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp') return '▨';
  if (ext === 'md') return '¶';
  return '·';
}

function extensionsFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'html' || ext === 'htm') return [html()];
  if (ext === 'css') return [css()];
  if (ext === 'js' || ext === 'mjs' || ext === 'jsx') return [javascript({ jsx: true })];
  if (ext === 'ts' || ext === 'tsx') return [javascript({ typescript: true, jsx: ext === 'tsx' })];
  if (ext === 'json') return [javascript()];
  return [];
}
