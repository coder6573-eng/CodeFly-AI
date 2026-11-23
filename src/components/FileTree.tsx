import { useMemo, useState } from 'react';
import { formatBytes } from '../lib/format';
import { Icon } from './Icons';

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onNew: () => void;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
}

export default function FileTree({
  files,
  activeFile,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: FileTreeProps) {
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return Object.keys(files)
      .sort((a, b) => a.localeCompare(b))
      .filter((path) => !query || path.toLowerCase().includes(query))
      .map((path) => {
        const segments = path.split('/');
        return {
          path,
          name: segments[segments.length - 1],
          depth: Math.max(0, segments.length - 1),
          size: new Blob([files[path]]).size,
        };
      });
  }, [files, filter]);

  return (
    <div className="file-tree">
      <div className="tree-search">
        <Icon name="folder" size={14} />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
        />
        {filter && (
          <button className="icon-btn" onClick={() => setFilter('')} aria-label="Clear filter">
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      <div className="tree-list">
        {rows.length === 0 && (
          <div className="tree-empty">
            {Object.keys(files).length === 0 ? 'No files yet. Ask the agent to build.' : 'No matching files.'}
          </div>
        )}
        {rows.map((row) => (
          <button
            key={row.path}
            className={'file-row' + (row.path === activeFile ? ' active' : '')}
            onClick={() => onSelect(row.path)}
            title={row.path}
          >
            <span className="file-indent" style={{ width: row.depth * 12 }} />
            <Icon name={row.depth === 0 ? 'layers' : 'file'} size={14} />
            <span className="file-name">{row.name}</span>
            <span className="file-size">{formatBytes(row.size)}</span>
          </button>
        ))}
      </div>

      <div className="tree-actions">
        <button className="ghost-btn" onClick={onNew}>
          <Icon name="plus" size={14} /> New file
        </button>
        {activeFile && (
          <>
            <button className="icon-btn" onClick={() => onRename(activeFile)} title="Rename file" aria-label="Rename file">
              <Icon name="pencil" size={14} />
            </button>
            <button
              className="icon-btn danger"
              onClick={() => onDelete(activeFile)}
              title="Delete file"
              aria-label="Delete file"
            >
              <Icon name="trash" size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
