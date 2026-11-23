import { useEffect, useMemo, useRef, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import RoutePicker from './components/RoutePicker';
import SettingsDialog from './components/SettingsDialog';
import WorkspacePanel from './components/WorkspacePanel';
import { AgentStoppedError, runAgent } from './agent/engine';
import { getRoute } from './agent/routes';
import { downloadProjectZip } from './lib/exportZip';
import {
  loadActiveId,
  loadProjects,
  loadSettings,
  newProject,
  saveActiveId,
  saveProjects,
  saveSettings,
  uid,
} from './lib/storage';
import { friendlyError } from './lib/transport';
import type { AppSettings, ChatEntry, Project, RouteId } from './types';

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const stored = loadProjects();
    return stored.length > 0 ? stored : [newProject('My first app')];
  });
  const [activeId, setActiveId] = useState<string>(() => loadActiveId() ?? '');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [mobileView, setMobileView] = useState<'chat' | 'workspace'>('chat');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const active = useMemo(
    () => projects.find((project) => project.id === activeId) ?? projects[0] ?? null,
    [projects, activeId],
  );

  useEffect(() => {
    if (projects.length === 0) {
      const fresh = newProject('My first app');
      setProjects([fresh]);
      setActiveId(fresh.id);
      return;
    }
    if (!projects.some((project) => project.id === activeId)) {
      setActiveId(projects[0].id);
    }
  }, [projects, activeId]);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    if (activeId) saveActiveId(activeId);
  }, [activeId]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateProject = (id: string, updater: (project: Project) => Project) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === id ? { ...updater(project), updatedAt: Date.now() } : project,
      ),
    );
  };

  const handleRun = async (goal: string) => {
    if (!active || running) return;

    const projectId = active.id;
    const route = getRoute(active.routeId);
    const history = active.chat;
    const files = active.files;

    const userEntry: ChatEntry = { id: uid(), role: 'user', text: goal, at: Date.now() };
    const liveId = uid();
    const liveEntry: ChatEntry = {
      id: liveId,
      role: 'assistant',
      text: '',
      thinking: '',
      model: route.defaultModel,
      route: route.id,
      steps: [],
      tools: 0,
      at: Date.now(),
    };

    updateProject(projectId, (project) => ({
      ...project,
      chat: [...project.chat, userEntry, liveEntry],
    }));

    setRunning(true);
    setStatus('Preparing workspace');
    const controller = new AbortController();
    abortRef.current = controller;

    const patchLive = (patch: (entry: ChatEntry) => ChatEntry) => {
      updateProject(projectId, (project) => ({
        ...project,
        chat: project.chat.map((entry) => (entry.id === liveId ? patch(entry) : entry)),
      }));
    };

    try {
      const result = await runAgent({
        route,
        model: active.model,
        goal,
        files,
        history,
        maxTurns: settings.maxTurns,
        temperature: settings.temperature,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'status') {
            setStatus(event.text);
          } else if (event.type === 'thinking') {
            patchLive((entry) => ({
              ...entry,
              thinking: entry.thinking ? entry.thinking + '\n\n' + event.text : event.text,
            }));
          } else if (event.type === 'assistant') {
            patchLive((entry) => ({
              ...entry,
              text: entry.text ? entry.text + '\n\n' + event.text : event.text,
            }));
          } else if (event.type === 'tool') {
            patchLive((entry) => ({
              ...entry,
              tools: (entry.tools ?? 0) + 1,
              steps: [...(entry.steps ?? []), (event.ok === false ? '✗ ' : '✓ ') + event.detail].slice(-200),
            }));
          } else if (event.type === 'model') {
            patchLive((entry) => ({ ...entry, model: event.model, route: event.route }));
          } else if (event.type === 'error') {
            patchLive((entry) => ({
              ...entry,
              error: true,
              text: entry.text ? entry.text + '\n\n' + event.message : event.message,
            }));
          }
        },
        onSnapshot: (snapshotFiles) => {
          updateProject(projectId, (project) => ({ ...project, files: snapshotFiles }));
        },
      });

      const note =
        result.finishReason === 'limit'
          ? '\n\n_Reached the step limit - send a follow-up message to continue._'
          : '';

      patchLive((entry) => ({
        ...entry,
        text: (result.summary || entry.text || 'Done.') + note,
        model: result.resolvedModel,
        route: route.id,
        tools: result.toolCalls,
      }));
    } catch (error) {
      if (error instanceof AgentStoppedError) {
        patchLive((entry) => ({
          ...entry,
          text: entry.text || 'Stopped.',
          steps: [...(entry.steps ?? []), '✗ Stopped by user'],
        }));
      } else {
        patchLive((entry) => ({
          ...entry,
          error: true,
          text: (entry.text ? entry.text + '\n\n' : '') + friendlyError(error),
        }));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setStatus('');
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRouteChange = (routeId: RouteId, model: string | null) => {
    if (!active) return;
    updateProject(active.id, (project) => ({ ...project, routeId, model }));
  };

  const handleFilesChange = (files: Record<string, string>) => {
    if (!active) return;
    updateProject(active.id, (project) => ({ ...project, files }));
  };

  const handleExport = async () => {
    if (!active || exporting) return;
    setExporting(true);
    try {
      await downloadProjectZip(active);
    } catch (error) {
      window.alert('Could not export the ZIP: ' + friendlyError(error));
    } finally {
      setExporting(false);
    }
  };

  const addProject = () => {
    const project = newProject('Project ' + (projects.length + 1));
    setProjects((current) => [...current, project]);
    setActiveId(project.id);
    setMobileView('chat');
  };

  const deleteProject = () => {
    if (!active) return;
    if (!window.confirm('Delete "' + active.name + '" and all its files?')) return;
    const remaining = projects.filter((project) => project.id !== active.id);
    if (remaining.length === 0) {
      const fresh = newProject('My first app');
      setProjects([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setProjects(remaining);
    if (active.id === activeId) setActiveId(remaining[0].id);
  };

  const startRename = () => {
    if (!active) return;
    setDraftName(active.name);
    setRenaming(true);
  };

  const commitRename = () => {
    const name = draftName.trim();
    if (active && name) updateProject(active.id, (project) => ({ ...project, name }));
    setRenaming(false);
  };

  return (
    <div className={'app mobile-' + mobileView}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✈</span>
          <span className="brand-name">
            CodeFly<span> AI</span>
          </span>
        </div>

        <div className="project-bar">
          {renaming ? (
            <input
              autoFocus
              className="rename-input"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename();
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <select
              className="project-select"
              aria-label="Project"
              value={active?.id ?? ''}
              onChange={(event) => setActiveId(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="icon-button" onClick={addProject} title="New project">
            ＋
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={startRename}
            title="Rename project"
            disabled={!active}
          >
            ✎
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={deleteProject}
            title="Delete project"
            disabled={!active}
          >
            🗑
          </button>
        </div>

        <div className="topbar-right">
          {active ? (
            <RoutePicker routeId={active.routeId} model={active.model} onChange={handleRouteChange} />
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="layout">
        <ChatPanel
          entries={active?.chat ?? []}
          running={running}
          status={status}
          disabled={!active}
          showThinking={settings.showThinking}
          onRun={handleRun}
          onStop={handleStop}
        />
        <WorkspacePanel
          files={active?.files ?? {}}
          onFilesChange={handleFilesChange}
          autoPreview={settings.autoPreview}
          running={running}
          exporting={exporting}
          onExport={handleExport}
        />
      </main>

      <nav className="mobile-nav" aria-label="Views">
        <button
          type="button"
          className={mobileView === 'chat' ? 'active' : ''}
          onClick={() => setMobileView('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={mobileView === 'workspace' ? 'active' : ''}
          onClick={() => setMobileView('workspace')}
        >
          Workspace
        </button>
      </nav>

      {showSettings ? (
        <SettingsDialog
          settings={settings}
          onSave={(next) => {
            setSettings(next);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </div>
  );
}
