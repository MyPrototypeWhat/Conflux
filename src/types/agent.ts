export type AgentStatus = "pending" | "connected" | "error"

export interface AgentConfig {
  id: string
  name: string
  description: string
  icon?: string
}

export interface AgentState {
  id: string
  status: AgentStatus
  config: AgentConfig
}

export const AGENTS: AgentConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic's CLI coding assistant",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI's code generation agent",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    description: "Google's terminal AI agent",
  },
]
