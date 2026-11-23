import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';

const cmTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: '#dbe2f2',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      lineHeight: '1.65',
    },
    '.cm-content': { padding: '14px 0', caretColor: '#8b7bff' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#454d63',
      border: 'none',
      paddingRight: '6px',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.035)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#9aa5c0' },
    '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(109,94,252,.32)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#8b7bff' },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(255,255,255,.08)',
      border: 'none',
      color: '#9aa5c0',
    },
    '.cm-tooltip': {
      backgroundColor: '#161a26',
      border: '1px solid rgba(255,255,255,.1)',
      borderRadius: '8px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'rgba(109,94,252,.25)',
    },
  },
  { dark: true },
);

function languageFor(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return html();
  if (lower.endsWith('.css')) return css();
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return javascript();
  if (lower.endsWith('.jsx')) return javascript({ jsx: true });
  if (lower.endsWith('.ts')) return javascript({ typescript: true });
  if (lower.endsWith('.tsx')) return javascript({ jsx: true, typescript: true });
  if (lower.endsWith('.json')) return javascript();
  return [];
}

export default function CodeEditor({
  path,
  value,
  onChange,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const extensions = useMemo(() => [languageFor(path)], [path]);

  return (
    <CodeMirror
      className="code-mirror"
      value={value}
      height="100%"
      theme={cmTheme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
      }}
    />
  );
}
