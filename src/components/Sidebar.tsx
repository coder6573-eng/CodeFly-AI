import type { Project } from '../types';
import { timeAgo } from '../lib/format';
import { Logo, Icon } from './Icons';

interface SidebarProps {
  projects: Project[];
  activeId: string;
  open: boolean;
  runtime: string;
  routeLabel: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
}

export default function Sidebar({
  projects,
  activeId,
  open,
  runtime,
  routeLabel,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onSettings,
}: SidebarProps) {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <div className={'rail-backdrop' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'rail' + (open ? ' open' : '')}>
        <div className="rail-head">
          <div className="brand">
            <Logo />
            <div>
              <div className="brand-name">CodeFly AI</div>
              <div className="brand-sub">agentic app builder</div>
            </div>
          </div>
          <button className="icon-btn rail-close" onClick={onClose} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <button className="new-project" onClick={onNew}>
          <Icon name="plus" size={16} />
          New project
        </button>

        <div className="rail-label">
          <span>Projects</span>
          <span className="rail-count">{projects.length}</span>
        </div>

        <nav className="project-list">
          {sorted.map((project) => {
            const fileCount = Object.keys(project.files).length;
            return (
              <div
                key={project.id}
                className={'project-row' + (project.id === activeId ? ' active' : '')}
              >
                <button className="project-main" onClick={() => onSelect(project.id)}>
                  <span className="project-dot" />
                  <span className="project-copy">
                    <span className="project-name">{project.name || 'Untitled project'}</span>
                    <span className="project-meta">
                      {fileCount === 0 ? 'empty' : fileCount + ' file' + (fileCount === 1 ? '' : 's')}
                      {' · '}
                      {timeAgo(project.updatedAt)}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn project-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(project.id);
                  }}
                  aria-label={'Delete ' + project.name}
                  title="Delete project"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })}
        </nav>

        <div className="rail-foot">
          <button className="rail-chip" onClick={onSettings} title="Change AI route and limits">
            <span className="live-dot" />
            <span className="rail-chip-label">{routeLabel}</span>
            <Icon name="settings" size={15} />
          </button>
          <div className="rail-note">
            <Icon name="bolt" size={13} />
            keyless · {runtime}
          </div>
        </div>
      </aside>
    </>
  );
}
