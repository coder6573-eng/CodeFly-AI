import { useEffect, useRef, useState } from 'react';
import type { ChatEntry, Project, RunStep } from '../types';
import { getRoute } from '../agent/routes';
import { formatTime } from '../lib/format';
import { Icon, Logo, Spinner } from './Icons';

interface ChatPanelProps {
  project: Project;
  running: boolean;
  activity: string;
  steps: RunStep[];
  liveModel: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

const SUGGESTIONS = [
  {
    title: 'SaaS landing page',
    description: 'Hero, feature grid, pricing and FAQ with a real responsive layout.',
    prompt:
      'Build a polished SaaS landing page for a developer analytics product called Orbit. Include a sticky nav, hero with gradient artwork, three feature cards, a pricing section with three tiers, an FAQ accordion, and a footer. Use a dark theme with strong typography and smooth scroll. All CSS and JS must live in separate files and work offline.',
  },
  {
    title: 'Kanban board',
    description: 'Drag-and-drop tasks that survive a reload via localStorage.',
    prompt:
      'Build a kanban task board with three columns (Backlog, Doing, Done). Support adding, editing, deleting and dragging cards between columns, plus per-card priority colours. Persist everything in localStorage with safe parsing. Include an empty state and a card counter per column.',
  },
  {
    title: 'Neon snake game',
    description: 'Canvas game with keyboard and touch controls plus a high score.',
    prompt:
      'Build a complete neon snake game on a canvas. Include keyboard arrow/WASD controls and on-screen touch buttons for phones, pause/resume, score, a persisted high score and a game-over overlay with restart. Grid-based movement with smooth interpolation and a subtle glow.',
  },
  {
    title: 'Expense tracker',
    description: 'Categories, monthly totals and a chart, saved on device.',
    prompt:
      'Build an expense tracker with add/delete entries (amount, category, note, date), a category breakdown chart drawn with inline SVG (no external library), monthly totals, and localStorage persistence. Include filters by month and category, an empty state, and a clean mobile-first layout.',
  },
];

function RichText({ text }: { text: string }) {
  const parts = text.split('```');
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const body = part.replace(/^[a-zA-Z0-9_-]*\n/, '');
          return (
            <pre className="inline-code" key={index}>
              <code>{body.replace(/\n$/, '')}</code>
            </pre>
          );
        }
        return (
          <span className="prose" key={index}>
            {part}
          </span>
        );
      })}
    </>
  );
}

function MessageRow({ entry }: { entry: ChatEntry }) {
  if (entry.role === 'system') {
    return (
      <div className="sys-note">
        <Icon name="sparkles" size={14} />
        <span>{entry.text}</span>
      </div>
    );
  }

  const isUser = entry.role === 'user';
  const meta = isUser
    ? formatTime(entry.at)
    : [entry.model, entry.route, entry.tools ? entry.tools + ' tool calls' : null]
        .filter(Boolean)
        .join(' · ');

  return (
    <article className={'msg ' + (isUser ? 'from-user' : 'from-agent') + (entry.error ? ' has-error' : '')}>
      {!isUser && (
        <div className="msg-avatar">
          <Logo size={22} />
        </div>
      )}
      <div className="msg-body">
        <div className="msg-bubble">
          <RichText text={entry.text} />
        </div>
        {entry.steps && entry.steps.length > 0 && (
          <details className="msg-steps">
            <summary>
              <Icon name="layers" size={13} />
              {entry.steps.length} action{entry.steps.length === 1 ? '' : 's'}
            </summary>
            <ol>
              {entry.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </details>
        )}
        {meta && (
          <div className="msg-meta">
            {entry.error && <span className="error-tag">error</span>}
            <span>{meta}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function RunCard({ activity, steps, model }: { activity: string; steps: RunStep[]; model: string }) {
  const visible = steps.slice(-8).reverse();
  return (
    <div className="run-card">
      <div className="run-head">
        <span className="run-spinner">
          <Spinner size={15} />
        </span>
        <span className="run-title">Agent working</span>
        {model && <span className="run-model">{model}</span>}
      </div>
      <div className="run-activity">{activity || 'Thinking...'}</div>
      {visible.length > 0 && (
        <ul className="run-steps">
          {visible.map((step) => (
            <li key={step.id} className={step.ok ? 'ok' : 'bad'}>
              <Icon name={step.ok ? 'check' : 'alert'} size={12} />
              <span className="run-step-name">{step.detail}</span>
              <span className="run-step-tool">{step.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="chat-empty">
      <div className="empty-glow" />
      <Logo size={46} />
      <h2>What are we building?</h2>
      <p>
        Describe an app. The agent inspects the workspace, writes real files, verifies them and runs the result in
        the preview — no terminal, no keys.
      </p>
      <div className="suggestion-grid">
        {SUGGESTIONS.map((suggestion) => (
          <button className="suggestion" key={suggestion.title} onClick={() => onPick(suggestion.prompt)}>
            <span className="suggestion-title">
              <Icon name="wand" size={14} />
              {suggestion.title}
            </span>
            <span className="suggestion-desc">{suggestion.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel({
  project,
  running,
  activity,
  steps,
  liveModel,
  onSend,
  onStop,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const route = getRoute(project.routeId);
  const modelLabel = project.model ?? 'auto model';
  const hasConversation = project.chat.some((entry) => entry.role !== 'system');

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [project.chat.length, steps.length, running, activity]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
  }, [draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft('');
    onSend(text);
  };

  return (
    <section className="chat-panel">
      <header className="chat-head">
        <div className="chat-head-copy">
          <h1>{project.name || 'Untitled project'}</h1>
          <p>
            <span className="live-dot" />
            {route.label}
            <span className="dot-sep">·</span>
            {modelLabel}
          </p>
        </div>
        <div className="chat-head-stats">
          <span>{Object.keys(project.files).length} files</span>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {!hasConversation && <EmptyState onPick={onSend} />}
        {project.chat.map((entry) => (
          <MessageRow key={entry.id} entry={entry} />
        ))}
        {running && <RunCard activity={activity} steps={steps} model={liveModel} />}
      </div>

      <div className="composer">
        <div className={'composer-box' + (running ? ' busy' : '')}>
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={running ? 'Agent is working…' : 'Describe an app or a change…'}
            disabled={running}
            aria-label="Message CodeFly"
          />
          <div className="composer-actions">
            <span className="composer-hint">
              {running ? 'You can stop the run at any time' : 'Enter to send · Shift+Enter for a new line'}
            </span>
            {running ? (
              <button className="stop-btn" onClick={onStop}>
                <Icon name="stop" size={14} />
                Stop
              </button>
            ) : (
              <button className="send-btn" onClick={submit} disabled={!draft.trim()}>
                <Icon name="send" size={15} />
                Build
              </button>
            )}
          </div>
        </div>
        <div className="composer-foot">
          <span>
            <Icon name="globe" size={12} /> keyless route
          </span>
          <span>
            <Icon name="file" size={12} /> text-only workspace
          </span>
          <span>
            <Icon name="bolt" size={12} /> no terminal access
          </span>
        </div>
      </div>
    </section>
  );
}
