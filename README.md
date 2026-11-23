# CodeFly AI

**Describe an app. Watch an agent build it.** CodeFly is a keyless, cross-platform coding agent that writes complete static web projects — HTML, CSS and vanilla JS — and runs them in a live preview. No login, no API keys, no terminal.

Built with React + TypeScript + Vite, wrapped with Capacitor for Android and Electron for Windows.

---

## What makes it an agent (not a chat wrapper)

Every request runs a real multi-step loop:

```
user goal
   │
   ▼
system prompt + workspace snapshot + recent conversation
   │
   ▼
┌──────────────────────────────────────────────┐
│  model turn                                  │
│    ├─ native function calls (preferred)      │
│    └─ JSON action protocol (fallback)        │
│                                              │
│  tool execution on the in-memory workspace   │
│    ├─ create / edit / delete / rename files  │
│    ├─ observations fed back to the model     │
│    └─ live snapshot → preview refresh        │
└──────────────────────────────────────────────┘
   │  repeat until finish tool / step limit
   ▼
summary + files + trace persisted with the project
```

The agent can only act through tools, so it cannot pretend work happened. `finish` is rejected until the workspace contains a root `index.html`. Step limits, tool-call budgets and abort support keep runs bounded.

### Tools

| Tool | Purpose |
| --- | --- |
| `list_files` | See every project file and its size |
| `read_file` | Read exact text (optionally a line range) |
| `write_file` | Create a file or fully overwrite it |
| `edit_file` | Exact-snippet replacement, unique-match enforcement |
| `delete_file` | Remove a stale file |
| `rename_file` | Move or rename a file |
| `finish` | End the run with a summary (requires `index.html`) |

Every tool result is an observation returned to the model. Path traversal, binary content, oversized files and runaway file counts are rejected with corrective messages instead of crashing.

### Two protocols, one loop

- **Native tools** — routes that support OpenAI-style function calling use schemas from `src/agent/tools.ts`.
- **JSON actions** — routes without tool support (for example Pollinations) get a strict `{"thought","action","action_input"}` protocol. Malformed replies are repaired or corrected for two retries, then the run stops cleanly.

If a native route ignores the tools and replies with a JSON action, the engine detects it and switches protocol mid-run instead of wasting the turn.

---

## Keyless routes

| Route | Default model | Tools | Notes |
| --- | --- | --- | --- |
| **Kilo Auto** | `kilo-auto/free` | ✅ | Server-side router, 200 req/hour per IP |
| **Kilo Free** | `minimax/minimax-m2.1:free` | ✅ | Pin a specific free model |
| **LLM7** | `gpt-4.1-nano` | ✅ | Anonymous tier, ~30 req/min |
| **Pollinations** | `openai-fast` | ❌ | JSON protocol fallback |
| **OVHcloud** | `gpt-oss-120b` | ✅ | EU-hosted, ~2 req/min anonymous |
| **Free.ai** | `qwen-coder` | ✅ | Self-hosted open models |

Route metadata lives in `src/agent/routes.ts`. Model lists are fetched at runtime when available and fall back to curated defaults.

---

## Workspace and preview

- Projects are stored in `localStorage` (last 30), including files, chat, model route and the action trace.
- The preview builds a **single self-contained HTML document** from the project: stylesheets and scripts are inlined, images/fonts become data URLs, and runtime errors are reported back to the IDE banner.
- Export any project as a `.zip` with the original file paths.
- The editor is CodeMirror with HTML/CSS/JS/TS highlighting; manual edits are first-class and feed straight back into the preview.

---

## Project layout

```
src/
  agent/
    engine.ts        multi-turn loop, native + JSON protocols, limits
    tools.ts         workspace model, tool schemas, executor
    prompts.ts       system prompt, workspace outline, protocol rules
    jsonProtocol.ts  tolerant JSON-action parser
    routes.ts        keyless gateway catalog
  lib/
    transport.ts     fetch/bridge layer, model discovery, errors
    preview.ts       inlines a project into a runnable document
    projects.ts      persistence and project helpers
    settings.ts      run limits and temperature
    download.ts      zip export
  components/        chat, workbench, file tree, editor, preview, settings
  App.tsx            orchestration and state
  styles.css         responsive dark UI
electron/            sandboxed desktop shell with a network allowlist
```

---

## Development

```bash
npm install
npm run dev          # web app on http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production bundle

npm run electron:dev # desktop shell pointing at the Vite server
npm run electron:build

npm run android:add  # once
npm run android:sync
npm run android:open
```

CI (`.github/workflows/ci.yml`) runs typecheck + build on every push and pull request. Tagged releases build the Android APK and Windows installer.

---

## Security model

- The renderer is sandboxed with context isolation and no Node integration.
- The Electron bridge exposes exactly one channel: an HTTPS proxy restricted to the gateway allowlist. There is no shell, filesystem or terminal IPC.
- The agent has no network tools and no command execution. It can only write text files into the virtual project.
- Preview iframes are sandboxed; generated code runs with its own scripts but without access to the app's Node/bridge surface.
- No secrets are required or stored. Never paste keys into a project.

## Known limits

- Generated projects must be static and buildless. No npm packages, servers or native code.
- Free keyless lanes are shared per IP; HTTP 429 means wait or switch route.
- The preview inlines relative assets; very large projects or exotic module graphs may need the exported zip run in a real browser.
- Model quality varies. The agent verifies what it can (files, paths, required entry point) but cannot execute a browser to test behavior.
