# Conflux

A unified AI Agent desktop client that brings Claude Code, Codex, Gemini CLI and other AI coding assistants together in one application.

## Features

- **Multi-Agent Tab Management** - Run multiple AI Agents simultaneously in one window, switch between them like browser tabs
- **Unified Experience** - Consistent interface and interactions across all Agents
- **Quick Agent Switching** - Launch different AI Agents with one click from the New Tab page

## Getting Started

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

## Supported Agents

| Agent | Provider | Description |
|-------|----------|-------------|
| Claude Code | Anthropic | CLI coding assistant |
| Codex | OpenAI | Code generation agent |
| Gemini CLI | Google | Terminal AI agent |

## Roadmap

### Dynamic UI Rendering
- [ ] Agents can dynamically generate interactive UI components based on task context
- [ ] Support for forms, buttons, code previews and other rich interface elements
- [ ] Progressive loading with smooth display of Agent's reasoning and execution process

### Multi-Agent Collaboration
- [ ] Agents can invoke each other and hand off tasks
- [ ] Split complex tasks across multiple Agents for parallel processing
- [ ] Unified task status tracking and result aggregation

### Agent Adapters
- [ ] Claude Code full integration
- [ ] Codex full integration
- [ ] Gemini CLI full integration
- [ ] Custom Agent onboarding support
