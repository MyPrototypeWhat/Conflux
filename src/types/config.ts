// ============================================
// Global Configuration
// ============================================

export interface ProxyConfig {
  enabled: boolean
  url: string
}

export interface GlobalConfig {
  /** Default working directory for all agents */
  defaultWorkingDirectory: string
  /** Proxy settings */
  proxy: ProxyConfig
  /** UI Theme */
  theme: 'light' | 'dark' | 'system'
  /** Auto-connect agents on startup */
  autoConnect: boolean
  /** Default request timeout in milliseconds */
  timeout: number
  /** Language */
  locale: 'en' | 'zh-CN' | 'system'
}

// ============================================
// Agent Base Configuration
// ============================================

export interface BaseAgentConfig {
  /** Override working directory (empty = inherit global) */
  workingDirectory: string
  /** Whether this agent is enabled */
  enabled: boolean
}

// ============================================
// Gemini CLI Configuration
// ============================================

export interface GeminiA2AServerConfig {
  /** A2A server port */
  port: number
  /** Auto-start A2A server when connecting */
  autoStart: boolean
  /** Custom start command (empty = use default) */
  command: string
}

export interface GeminiConfig extends BaseAgentConfig {
  /** Model to use */
  model: string
  /** A2A server settings */
  a2aServer: GeminiA2AServerConfig
  /** Enable sandbox mode */
  sandboxMode: boolean
  /** Allowed tools (empty = all) */
  allowedTools: string[]
}

// ============================================
// Claude Code Configuration
// ============================================

export interface ClaudeCodeConfig extends BaseAgentConfig {
  /** Model to use */
  model: string
  /** Max output tokens */
  maxTokens: number
  /** Enable dangerous mode (skip confirmations) */
  dangerousMode: boolean
  /** Allowed commands pattern */
  allowedCommands: string[]
}

// ============================================
// Codex Configuration
// ============================================

export interface CodexConfig extends BaseAgentConfig {
  /** Model to use */
  model: string
  /** Max output tokens */
  maxTokens: number
  /** Enable auto-approve mode */
  autoApprove: boolean
}

// ============================================
// All Agent Configs
// ============================================

export interface AgentConfigs {
  'gemini-cli': GeminiConfig
  'claude-code': ClaudeCodeConfig
  codex: CodexConfig
}

export type AgentId = keyof AgentConfigs

// ============================================
// Complete App Configuration
// ============================================

export interface AppConfig {
  global: GlobalConfig
  agents: AgentConfigs
}

// ============================================
// Default Values
// ============================================

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  defaultWorkingDirectory: '',
  proxy: {
    enabled: false,
    url: '',
  },
  theme: 'system',
  autoConnect: false,
  timeout: 30000,
  locale: 'system',
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  enabled: true,
  workingDirectory: '',
  model: 'gemini-2.5-flash',
  a2aServer: {
    port: 50001,
    autoStart: true,
    command: '',
  },
  sandboxMode: false,
  allowedTools: [],
}

export const DEFAULT_CLAUDE_CODE_CONFIG: ClaudeCodeConfig = {
  enabled: true,
  workingDirectory: '',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  dangerousMode: false,
  allowedCommands: [],
}

export const DEFAULT_CODEX_CONFIG: CodexConfig = {
  enabled: true,
  workingDirectory: '',
  model: 'gpt-4o',
  maxTokens: 4096,
  autoApprove: false,
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  global: DEFAULT_GLOBAL_CONFIG,
  agents: {
    'gemini-cli': DEFAULT_GEMINI_CONFIG,
    'claude-code': DEFAULT_CLAUDE_CODE_CONFIG,
    codex: DEFAULT_CODEX_CONFIG,
  },
}
