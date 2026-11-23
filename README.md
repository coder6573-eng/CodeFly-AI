# CodeFly AI

Keyless, cross-platform vibe-coding platform. Describe an app and CodeFly generates a complete, runnable web project - plain HTML, CSS and vanilla JavaScript - with a live preview, a code editor and ZIP export. No accounts, no API keys, no terminal.

## Highlights

- **Six keyless AI routes** - Kilo Auto, Kilo Free Models, LLM7, Pollinations, OVHcloud and Free.ai
- **Agent loop** - native tool calling with an automatic JSON-protocol fallback for models without tools
- **Virtual workspace** - the model can only create, edit, rename, read and delete project files
- **Live preview** - projects render instantly in a sandboxed iframe; local CSS/JS are inlined automatically
- **Code editor** - CodeMirror with HTML, CSS, JavaScript and JSON support
- **Projects** - multiple projects stored in localStorage; export any project as a ZIP
- **Desktop + Android** - Electron (Windows) and Capacitor (Android) packaging with CI workflows

## Getting started

Requirements: Node.js 20+

    npm install
    npm run dev

The dev server runs at http://localhost:5173.

## Scripts

- npm run dev - Vite dev server
- npm run typecheck - TypeScript check
- npm run build - typecheck and production build to dist/
- npm run electron:dev - Vite + Electron
- npm run electron:build - Windows installer
- npm run android:sync / android:open - Capacitor Android

## Architecture

- src/agent/engine.ts - run loop (native tools + JSON fallback, budgets, snapshots)
- src/agent/tools.ts - virtual workspace and tool implementations
- src/agent/prompts.ts - system prompt and protocol texts
- src/agent/routes.ts - gateway definitions
- src/lib/transport.ts - OpenAI-compatible HTTP transport
- src/App.tsx - app shell, project state and run orchestration
- src/components/ - chat, workspace (preview + editor), route picker, settings
- src/lib/preview.ts - self-contained preview document builder
- src/lib/storage.ts - localStorage persistence
- src/lib/exportZip.ts - project ZIP export
- electron/ - desktop shell with an allowlisted network bridge

## Routes

| Route | Tools | Notes |
| --- | --- | --- |
| Kilo Auto | yes | auto-routed free model, 200 req/hour per IP |
| Kilo Free Models | yes | pin an exact :free model |
| LLM7 | yes | anonymous tier, about 30 req/min |
| Pollinations | no | JSON action protocol fallback |
| OVHcloud | yes | anonymous lane, about 2 req/min per model |
| Free.ai | yes | keyless on self-hosted ids |

## License

MIT
