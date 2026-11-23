import { lazy, Suspense } from 'react';
import type { Project } from '../types';
import { formatBytes, lineCount } from '../lib/format';
import { Icon, Spinner } from './Icons';
import FileTree from './FileTree';
import PreviewPane from './PreviewPane';

const CodeEditor = lazy(() => import('./CodeEditor'));

export type WorkbenchTab = 'preview' | 'files';

interface WorkbenchProps {
  project: Project;
  tab: WorkbenchTab;
  activeFile: string | null;
  onTab: (tab: WorkbenchTab) => void;
  onSelectFile: (path: string) => void;
  onChangeFile: (path: string, content: string) => void;
  onNewFile: () => void;
  onDeleteFile: (path: string) => void;
  onRenameFile: (path: string) => void;
  onDownload: () => void;
}

export default function Workbench({
  project,
  tab,
  activeFile,
  onTab,
  onSelectFile,
  onChangeFile,
  onNewFile,
  onDeleteFile,
  onRenameFile,
  onDownload,
}: WorkbenchProps) {
  const fileCount = Object.keys(project.files).length;
  const totalBytes = Object.values(project.files).reduce(
    (sum, content) => sum + new Blob([content]).size,
    0,
  );
  const activeValue = activeFile !== null ? project.files[activeFile] : undefined;

  return (
    <section className="workbench">
      <header className="workbench-bar">
        <div className="wb-tabs" role="tablist" aria-label="Workspace view">
          <button
            role="tab"
            aria-selected={tab === 'preview'}
            className={tab === 'preview' ? 'active' : ''}
            onClick={() => onTab('preview')}
          >
            <Icon name="eye" size={14} /> Preview
          </button>
          <button
            role="tab"
            aria-selected={tab === 'files'}
            className={tab === 'files' ? 'active' : ''}
            onClick={() => onTab('files')}
          >
            <Icon name="code" size={14} /> Files
            <span className="tab-count">{fileCount}</span>
          </button>
        </div>
        <div className="wb-meta">
          <span className="wb-size">{formatBytes(totalBytes)}</span>
          <button className="ghost-btn" onClick={onDownload} disabled={fileCount === 0}>
            <Icon name="download" size={14} /> Export
          </button>
        </div>
      </header>

      <div className="workbench-body">
        {tab === 'preview' ? (
          <PreviewPane
            files={project.files}
            entry={activeFile && /\.html?$/i.test(activeFile) ? activeFile : null}
          />
        ) : (
          <div className="files-view">
            <FileTree
              files={project.files}
              activeFile={activeFile}
              onSelect={onSelectFile}
              onNew={onNewFile}
              onDelete={onDeleteFile}
              onRename={onRenameFile}
            />
            <div className="editor-col">
              {activeFile && activeValue !== undefined ? (
                <>
                  <div className="editor-head">
                    <div className="editor-path" title={activeFile}>
                      <Icon name="file" size={13} />
                      <span>{activeFile}</span>
                    </div>
                    <div className="editor-stats">
                      {lineCount(activeValue)} lines · {formatBytes(new Blob([activeValue]).size)}
                    </div>
                  </div>
                  <div className="editor-body">
                    <Suspense
                      fallback={
                        <div className="editor-loading">
                          <Spinner size={16} /> Loading editor
                        </div>
                      }
                    >
                      <CodeEditor
                        key={activeFile}
                        path={activeFile}
                        value={activeValue}
                        onChange={(value) => onChangeFile(activeFile, value)}
                      />
                    </Suspense>
                  </div>
                </>
              ) : (
                <div className="editor-empty">
                  <Icon name="code" size={26} />
                  <strong>Select a file</strong>
                  <p>Pick a file from the tree to inspect or edit it by hand.</p>
                  <button className="ghost-btn" onClick={onNewFile}>
                    <Icon name="plus" size={14} /> New file
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
