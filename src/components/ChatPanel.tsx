import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '../types';

interface ChatPanelProps {
  entries: ChatEntry[];
  running: boolean;
  status: string;
  disabled: boolean;
  showThinking: boolean;
  onRun: (goal: string) => void;
  onStop: () => void;
}

const SUGGESTIONS = [
  {
    label: 'Pomodoro timer',
    icon: '⏱',
    prompt:
      'A pomodoro timer with start, pause and reset, a session counter and a clean dark theme.',
  },
  {
    label: 'Snake game',
    icon: '🐍',
    prompt:
      'A polished snake game with arrow keys, score, high score saved in localStorage and swipe controls on mobile.',
  },
  {
    label: 'Expense tracker',
    icon: '💰',
    prompt:
      'An expense tracker with add and remove entries, categories, totals per category and localStorage persistence.',
  },
  {
    label: 'Portfolio site',
    icon: '🌐',
    prompt: 'A single-page personal portfolio with hero, projects grid, about and contact sections.',
  },
  {
    label: 'Todo app',
    icon: '✅',
    prompt:
      'A todo app with add, complete, filter (all/active/done), clear completed and localStorage persistence.',
  },
  {
    label: 'Landing page',
    icon: '🚀',
    prompt:
      'A modern SaaS landing page with hero, feature cards, pricing and a footer, using CSS only.',
  },
];

export default function ChatPanel(props: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [props.entries, props.status, props.running]);

  const submit = () => {
    const goal = input.trim();
    if (!goal || props.running || props.disabled) return;
    setInput('');
    props.onRun(goal);
  };

  return (
    <section className="chat-panel" aria-label="Chat">
      <div className="chat-scroll">
        {props.entries.length === 0 && !props.running ? (
          <div className="chat-empty">
            <div className="chat-empty-mark" aria-hidden="true">✈</div>
            <h2>What are we building?</h2>
            <p>
              Describe an app and CodeFly writes a complete, runnable web project - HTML, CSS and
              JavaScript, no setup.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="suggestion"
                  onClick={() => {
                    setInput(item.prompt);
                    textareaRef.current?.focus();
                  }}
                >
                  <span className="suggestion-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          props.entries.map((entry, index) => (
            <Entry
              key={entry.id}
              entry={entry}
              live={props.running && index === props.entries.length - 1}
              showThinking={props.showThinking}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {props.running ? (
        <div className="run-bar">
          <span className="spinner" aria-hidden="true" />
          <span className="run-status">{props.status || 'Working'}</span>
          <button type="button" className="stop-button" onClick={props.onStop}>
            Stop
          </button>
        </div>
      ) : null}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={2}
          value={input}
          placeholder={props.disabled ? 'Open or create a project first' : 'Describe an app, or ask for a change'}
          disabled={props.disabled || props.running}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-foot">
          <span className="composer-hint">Enter to run · Shift+Enter for a new line</span>
          <button
            type="submit"
            className="run-button"
            disabled={props.disabled || props.running || !input.trim()}
          >
            Run
            <span className="run-arrow" aria-hidden="true">➤</span>
          </button>
        </div>
      </form>
    </section>
  );
}

function Entry({ entry, live, showThinking }: { entry: ChatEntry; live: boolean; showThinking: boolean }) {
  if (entry.role === 'system') {
    return (
      <div className={'entry entry-system' + (entry.error ? ' entry-error' : '')}>{entry.text}</div>
    );
  }

  const isUser = entry.role === 'user';
  const steps = entry.steps ?? [];
  const thinking = showThinking && entry.thinking ? entry.thinking : '';

  return (
    <article className={'entry entry-' + entry.role + (entry.error ? ' entry-error' : '')}>
      {thinking ? (
        <details className="thinking" open={live || undefined}>
          <summary>
            <span className="thinking-spark" aria-hidden="true">✦</span> Thinking
          </summary>
          <div className="thinking-body">{thinking}</div>
        </details>
      ) : null}

      <div className="entry-bubble">
        <div className="entry-text">{entry.text || (entry.error ? '' : '…')}</div>
        {steps.length > 0 ? (
          <details className="entry-steps">
            <summary>
              {steps.length} step{steps.length === 1 ? '' : 's'}
            </summary>
            <ol>
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>

      {!isUser && (entry.model || entry.route || entry.tools) ? (
        <div className="entry-meta">
          {entry.model ? <span className="meta-model">{entry.model}</span> : null}
          {entry.route ? <span>{entry.route}</span> : null}
          {entry.tools ? (
            <span>
              {entry.tools} tool call{entry.tools === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
