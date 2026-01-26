# Conflux

A2A Agent Aggregation Platform - Unified desktop client for Claude Code, Codex, and Gemini CLI.

## Tech Stack

- **Framework**: Electron 40 + electron-vite
- **Frontend**: React 19 + TypeScript
- **UI**: shadcn/ui (lyra style) + Tailwind CSS 4
- **Protocol**: A2A (Agent-to-Agent)
- **UI Protocol**: A2UI (Progressive shadcn renderer)

## Development

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm dev

# Build application
pnpm build

# Package for distribution
pnpm build:dist
```

## Project Structure

```
conflux/
├── src/
│   ├── main/                 # Electron main process
│   │   └── index.ts
│   ├── preload/              # Preload scripts
│   │   └── index.ts
│   └── renderer/             # Renderer process (React)
│       ├── components/ui/    # shadcn components
│       ├── lib/utils.ts
│       ├── types/electron.d.ts
│       ├── App.tsx
│       ├── index.tsx
│       └── index.css
├── electron.vite.config.ts   # electron-vite config
├── components.json           # shadcn config
└── out/                      # Build output
```

## Roadmap

- [ ] A2UI renderer base components
- [ ] A2A protocol implementation
- [ ] Claude Code adapter
- [ ] Codex adapter
- [ ] Gemini CLI adapter
