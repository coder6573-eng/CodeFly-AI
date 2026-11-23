import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentEvent,
  AppSettings,
  ModelInfo,
  Project,
  RouteId,
  RunStep,
} from './types';
import { getRoute } from './agent/routes';
import { AgentStoppedError, runAgent } from './agent/engine';
import { fetchModels, friendlyError } from './lib/transport';
import {
  createEntry,
  createProject,
  deriveProjectName,
  loadActiveId,
  loadProjects,
  saveActiveId,
  saveProjects,
  uid,
} from './lib/projects';
import { loadSettings, saveSettings } from './lib/settings';
import { downloadProjectZip } from './lib/download';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import Workbench, { type WorkbenchTab } from './components/Workbench';
import SettingsModal from './components/SettingsModal';
import { Icon, Logo, Spinner } from './components/Icons';

type MobileView = 'chat' | 'work';

interface FilePrompt {
  mode: 'new' | 'rename';
  path?: string;
  value: string;
}

function bootstrap(): { projects: Project[]; activeId: string; settings: AppSettings } {
  const stored = loadProjects();
  const projects = stored.length > 0 ? stored : [createProject('My first app')];
  const saved = loadActiveId();
  const activeId = projects.some((project) => project.id === saved) ? (saved as string) : projects[0].id;
  return { projects, activeId, settings: loadSettings() };
}

export default function App() {
  const [boot] = useState(bootstrap);
  const [projects, setProjects] = useState<Project[]>(boot.projects);
  const [activeId, setActiveId] = useState<string>(boot.activeId);
  const [settings, setSettings] = useState<AppSettings>(boot.settings);

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkbenchTab>('preview');
  const [mobileView, setMobileView] = useState<MobileView>('chat');
  const [mobileRail, setMobileRail] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePrompt, setFilePrompt] = useState<FilePrompt | null>(null);
  const [fileError, setFileError] = useState('');

  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState('');
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [liveModel, setLiveModel] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const stepsRef = useRef<RunStep[]>([]);

  const project = useMemo(
    () => projects.find((item) => item.id === activeId) ?? projects[0],
    [projects, activeId],
  );
  const route = getRoute(project?.routeId);

  const patchProject = useCallback((id: string, updater: (current: Project) => Project) => {
    setProjects((previous) => previous.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  // Debounced persistence keeps typing and live snapshots cheap.
  useEffect(() => {
    const timer = setTimeout(() => saveProjects(projects), 250);
    return () => clearTimeout(timer);
  }, [projects]);

  useEffect(() => {
    if (activeId) saveActiveId(activeId);
  }, [activeId]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3_600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Pick a sensible open file when switching projects.
  useEffect(() => {
    setActiveFile((previous) => {
      if (previous && project.files[previous] !== undefined) return previous;
      if (project.files['index.html'] !== undefined) return 'index.html';
      return Object.keys(project.files)[0] ?? null;
    });
    setSteps([]);
    setActivity('');
  }, [project.id]);

  // Never let a run keep writing into a project the user left.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [project.id]);

  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const list = await fetchModels(getRoute(project.routeId));
      setModels(list);
    } finally {
      setLoadingModels(false);
    }
  }, [project.routeId]);

  useEffect(() => {
    if (!settingsOpen) return;
    void refreshModels();
  }, [settingsOpen, refreshModels]);

  const handleSend = async (raw: string) => {
    const goal = raw.trim();
    if (!goal || running || !project) return;

    const projectId = project.id;
    const activeRoute = getRoute(project.routeId);
    const controller = new AbortController();
    abortRef.current = controller;
    stepsRef.current = [];
    setSteps([]);
    setRunning(true);
    setActivity('Preparing workspace');
    setLiveModel(project.model ?? activeRoute.defaultModel);
    setMobileView('chat');

    patchProject(projectId, (current) => ({
      ...current,
      name:
        current.name === 'Untitled project' || current.name === 'My first app'
          ? deriveProjectName(goal)
          : current.name,
      chat: [...current.chat, createEntry('user', goal)],
      updatedAt: Date.now(),
    }));

    try {
      const result = await runAgent({
        route: activeRoute,
        model: project.model,
        goal,
        files: project.files,
        history: project.chat,
        maxTurns: settings.maxTurns,
        temperature: settings.temperature,
        signal: controller.signal,
        onEvent: (event: AgentEvent) => {
          if (event.type === 'status') setActivity(event.text);
          if (event.type === 'assistant') setActivity(event.text.slice(0, 160));
          if (event.type === 'model') setLiveModel(event.model);
          if (event.type === 'error') setActivity(event.message);
          if (event.type === 'tool') {
            const step: RunStep = {
              id: uid('step'),
              name: event.name,
              detail: event.detail,
              ok: event.ok !== false,
            };
            stepsRef.current = [...stepsRef.current.slice(-59), step];
            setSteps(stepsRef.current);
            setActivity(event.detail);
          }
        },
        onSnapshot: (files) => {
          patchProject(projectId, (current) => ({ ...current, files, updatedAt: Date.now() }));
          setActiveFile((previous) => {
            if (previous && files[previous] !== undefined) return previous;
            if (files['index.html'] !== undefined) return 'index.html';
            return Object.keys(files)[0] ?? null;
          });
        },
      });

      const assistant = createEntry('assistant', result.summary, {
        model: result.resolvedModel,
        route: activeRoute.label,
        tools: result.toolCalls,
        steps: stepsRef.current.map((step) => step.name + ' — ' + step.detail),
      });

      patchProject(projectId, (current) => ({
        ...current,
        files: result.files,
        chat: [...current.chat, assistant],
        updatedAt: Date.now(),
      }));

      if (result.finishReason === 'limit') {
        setToast('Step limit reached — ask the agent to continue if anything is missing.');
      } else {
        setToast('Build finished');
      }
      setTab('preview');
      setMobileView('work');
    } catch (error) {
      const aborted =
        error instanceof AgentStoppedError ||
        (error instanceof DOMException && error.name === 'AbortError');

      if (aborted) {
        patchProject(projectId, (current) => ({
          ...current,
          chat: [
            ...current.chat,
            createEntry('system', 'Run stopped. Files written so far were kept.'),
          ],
          updatedAt: Date.now(),
        }));
      } else {
        const message = friendlyError(error);
        patchProject(projectId, (current) => ({
          ...current,
          chat: [
            ...current.chat,
            createEntry('assistant', message, { error: true, model: activeRoute.label }),
          ],
          updatedAt: Date.now(),
        }));
        setToast(message);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(false);
        setSteps([]);
        setActivity('');
      }
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setActivity('Stopping…');
  };

  const handleRoute = (id: RouteId) => {
    patchProject(project.id, (current) => ({ ...current, routeId: id, model: null }));
    setModels([]);
  };

  const handleModel = (id: string | null) => {
    patchProject(project.id, (current) => ({ ...current, model: id }));
  };

  const handleNewProject = () => {
    const created = createProject('Untitled project');
    setProjects((previous) => [created, ...previous]);
    setActiveId(created.id);
    setActiveFile(null);
    setTab('preview');
    setMobileView('chat');
    setMobileRail(false);
  };

  const handleSelectProject = (id: string) => {
    setActiveId(id);
    setMobileRail(false);
    setMobileView('chat');
    setTab('preview');
  };

  const handleDeleteProject = (id: string) => {
    if (!window.confirm('Delete this project and all of its files?')) return;
    const remaining = projects.filter((item) => item.id !== id);
    if (remaining.length === 0) {
      const created = createProject('My first app');
      setProjects([created]);
      setActiveId(created.id);
      return;
    }
    setProjects(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  };

  const updateFile = (path: string, content: string) => {
    patchProject(project.id, (current) => ({
      ...current,
      files: { ...current.files, [path]: content },
      updatedAt: Date.now(),
    }));
  };

  const openNewFile = () => {
    setFileError('');
    setFilePrompt({ mode: 'new', value: 'app.js' });
  };

  const openRenameFile = (path: string) => {
    setFileError('');
    setFilePrompt({ mode: 'rename', path, value: path });
  };

  const closeFilePrompt = () => {
    setFilePrompt(null);
    setFileError('');
  };

  const submitFilePrompt = () => {
    if (!filePrompt) return;
    const target = filePrompt.value.trim().replace(/^\/+/, '');

    if (!target) {
      setFileError('Enter a file path.');
      return;
    }
    if (filePrompt.mode === 'new') {
      if (project.files[target] !== undefined) {
        setFileError('That file already exists.');
        return;
      }
      patchProject(project.id, (current) => ({
        ...current,
        files: { ...current.files, [target]: '' },
        updatedAt: Date.now(),
      }));
      setActiveFile(target);
      setTab('files');
      setMobileView('work');
      closeFilePrompt();
      return;
    }

    const from = filePrompt.path;
    if (!from) return closeFilePrompt();
    if (target === from) return closeFilePrompt();
    if (project.files[target] !== undefined) {
      setFileError('A file with that name already exists.');
      return;
    }
    patchProject(project.id, (current) => {
      const files = { ...current.files };
      files[target] = files[from];
      delete files[from];
      return { ...current, files, updatedAt: Date.now() };
    });
    setActiveFile((previous) => (previous === from ? target : previous));
    closeFilePrompt();
  };

  const handleDeleteFile = (path: string) => {
    if (!window.confirm('Delete ' + path + '?')) return;
    patchProject(project.id, (current) => {
      const files = { ...current.files };
      delete files[path];
      return { ...current, files, updatedAt: Date.now() };
    });
    setActiveFile((previous) => {
      if (previous !== path) return previous;
      const remaining = Object.keys(project.files).filter((item) => item !== path);
      if (remaining.includes('index.html')) return 'index.html';
      return remaining[0] ?? null;
    });
  };

  const handleDownload = async () => {
    try {
      await downloadProjectZip(project.name, project.files);
      setToast('Project exported as a zip');
    } catch (error) {
      setToast('Could not export: ' + friendlyError(error));
    }
  };

  const runtime =
    typeof window !== 'undefined' && window.codefly?.runtime === 'electron' ? 'desktop' : 'web';

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        activeId={project.id}
        open={mobileRail}
        runtime={runtime}
        routeLabel={route.label}
        onClose={() => setMobileRail(false)}
        onSelect={handleSelectProject}
        onNew={handleNewProject}
        onDelete={handleDeleteProject}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobileRail(true)}
            aria-label="Open projects"
          >
            <Icon name="menu" />
          </button>

          <div className="topbar-title">
            <Logo size={24} />
            <input
              className="project-title"
              value={project.name}
              onChange={(event) =>
                patchProject(project.id, (current) => ({ ...current, name: event.target.value }))
              }
              onBlur={() => {
                if (!project.name.trim()) {
                  patchProject(project.id, (current) => ({ ...current, name: 'Untitled project' }));
                }
              }}
              aria-label="Project name"
              spellCheck={false}
            />
            {running && (
              <span className="topbar-run">
                <Spinner size={13} /> agent running
              </span>
            )}
          </div>

          <div className="topbar-actions">
            <button className="route-pill" onClick={() => setSettingsOpen(true)} title="Change AI route">
              <span className="live-dot" />
              <span className="route-pill-label">{route.label}</span>
              <Icon name="chevronDown" size={13} />
            </button>
            <button className="ghost-btn topbar-export" onClick={handleDownload}>
              <Icon name="download" size={14} />
              <span>Export</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
            >
              <Icon name="settings" />
            </button>
          </div>
        </header>

        <div className="workspace">
          <div className={'pane chat-pane' + (mobileView === 'chat' ? ' mobile-active' : '')}>
            <ChatPanel
              project={project}
              running={running}
              activity={activity}
              steps={steps}
              liveModel={liveModel}
              onSend={handleSend}
              onStop={handleStop}
            />
          </div>
          <div className={'pane work-pane' + (mobileView === 'work' ? ' mobile-active' : '')}>
            <Workbench
              project={project}
              tab={tab}
              activeFile={activeFile}
              onTab={setTab}
              onSelectFile={setActiveFile}
              onChangeFile={updateFile}
              onNewFile={openNewFile}
              onDeleteFile={handleDeleteFile}
              onRenameFile={openRenameFile}
              onDownload={handleDownload}
            />
          </div>
        </div>

        <nav className="mobile-nav" aria-label="Views">
          <button
            className={mobileView === 'chat' ? 'active' : ''}
            onClick={() => setMobileView('chat')}
          >
            <Icon name="chat" size={17} /> Chat
          </button>
          <button
            className={mobileView === 'work' && tab === 'preview' ? 'active' : ''}
            onClick={() => {
              setTab('preview');
              setMobileView('work');
            }}
          >
            <Icon name="eye" size={17} /> Preview
          </button>
          <button
            className={mobileView === 'work' && tab === 'files' ? 'active' : ''}
            onClick={() => {
              setTab('files');
              setMobileView('work');
            }}
          >
            <Icon name="code" size={17} /> Files
          </button>
        </nav>
      </main>

      <SettingsModal
        open={settingsOpen}
        routeId={project.routeId}
        model={project.model}
        models={models}
        loadingModels={loadingModels}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onRoute={handleRoute}
        onModel={handleModel}
        onRefreshModels={() => void refreshModels()}
        onSettings={setSettings}
      />

      {filePrompt && (
        <div
          className="modal-overlay file-dialog-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFilePrompt();
          }}
        >
          <form
            className="mini-modal"
            onSubmit={(event) => {
              event.preventDefault();
              submitFilePrompt();
            }}
          >
            <h3>{filePrompt.mode === 'new' ? 'New file' : 'Rename file'}</h3>
            <p>
              {filePrompt.mode === 'new'
                ? 'Relative path inside the project. Folders are created automatically.'
                : 'Move this file to a new relative path.'}
            </p>
            <input
              autoFocus
              value={filePrompt.value}
              onChange={(event) => setFilePrompt({ ...filePrompt, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeFilePrompt();
              }}
              aria-label="File path"
              spellCheck={false}
            />
            {fileError && <span className="form-error">{fileError}</span>}
            <div className="mini-actions">
              <button type="button" className="ghost-btn" onClick={closeFilePrompt}>
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                {filePrompt.mode === 'new' ? 'Create file' : 'Rename'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={15} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
