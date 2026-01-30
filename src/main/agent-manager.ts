import { EventEmitter } from 'node:events'
import type { A2AMessage, AgentAdapter, AgentEvent, AgentStatusUpdate } from '../types/a2a'
import { ClaudeCodeAdapter } from './agents/claude-code-adapter'
import { CodexAdapter } from './agents/codex-adapter'
import { GeminiAdapter } from './agents/gemini-adapter'

// Adapter with getServerUrl capability
interface ServerUrlAdapter extends AgentAdapter {
  getServerUrl(): string | null
}

function hasServerUrl(adapter: AgentAdapter): adapter is ServerUrlAdapter {
  return (
    'getServerUrl' in adapter && typeof (adapter as ServerUrlAdapter).getServerUrl === 'function'
  )
}

export class AgentManager extends EventEmitter {
  private adapters: Map<string, AgentAdapter> = new Map()
  private activeContexts: Map<string, string> = new Map() // tabId -> contextId
  private contextProjectPaths: Map<string, string> = new Map() // contextId -> projectPath

  constructor() {
    super()
    this.registerAdapters()
  }

  private registerAdapters(): void {
    // Register Gemini adapter
    const geminiAdapter = new GeminiAdapter()
    geminiAdapter.on('status', (status: AgentStatusUpdate) => {
      this.emit('agent:status', { ...status, agentId: geminiAdapter.id })
    })
    this.adapters.set(geminiAdapter.id, geminiAdapter)

    // Register Codex adapter
    const codexAdapter = new CodexAdapter()
    codexAdapter.on('status', (status: AgentStatusUpdate) => {
      this.emit('agent:status', { ...status, agentId: codexAdapter.id })
    })
    this.adapters.set(codexAdapter.id, codexAdapter)

    // Register Claude Code adapter
    const claudeCodeAdapter = new ClaudeCodeAdapter()
    claudeCodeAdapter.on('status', (status: AgentStatusUpdate) => {
      this.emit('agent:status', { ...status, agentId: claudeCodeAdapter.id })
    })
    this.adapters.set(claudeCodeAdapter.id, claudeCodeAdapter)
  }

  getAdapter(agentId: string): AgentAdapter | undefined {
    return this.adapters.get(agentId)
  }

  getAllAdapterIds(): string[] {
    return Array.from(this.adapters.keys())
  }

  async connectAgent(agentId: string): Promise<void> {
    const adapter = this.adapters.get(agentId)
    if (!adapter) {
      throw new Error(`Agent not found: ${agentId}`)
    }
    await adapter.connect()
  }

  async disconnectAgent(agentId: string): Promise<void> {
    const adapter = this.adapters.get(agentId)
    if (adapter) {
      await adapter.disconnect()
    }
  }

  isAgentConnected(agentId: string): boolean {
    const adapter = this.adapters.get(agentId)
    return adapter?.isConnected() ?? false
  }

  /**
   * Get the server URL for an agent (for renderer-side A2A communication)
   */
  getServerUrl(agentId: string): string | null {
    const adapter = this.adapters.get(agentId)
    if (!adapter) return null

    if (hasServerUrl(adapter)) {
      return adapter.getServerUrl()
    }
    return null
  }

  /**
   * Get or create a context ID for a tab
   */
  getContextId(tabId: string): string {
    let contextId = this.activeContexts.get(tabId)
    if (!contextId) {
      contextId = crypto.randomUUID()
      this.activeContexts.set(tabId, contextId)
    }
    return contextId
  }

  /**
   * Set project path for a context
   */
  setContextProjectPath(contextId: string, projectPath: string): void {
    this.contextProjectPaths.set(contextId, projectPath)
  }

  /**
   * Get project path for a context
   */
  getContextProjectPath(contextId: string): string | undefined {
    return this.contextProjectPaths.get(contextId)
  }

  // Legacy method - message sending now happens in renderer
  async *sendMessage(
    agentId: string,
    content: string,
    tabId: string
  ): AsyncGenerator<AgentEvent, void, unknown> {
    const adapter = this.adapters.get(agentId)
    if (!adapter) {
      yield {
        type: 'error',
        error: { code: 'AGENT_NOT_FOUND', message: `Agent not found: ${agentId}` },
      }
      return
    }

    if (!adapter.isConnected()) {
      try {
        await adapter.connect()
      } catch (error) {
        yield {
          type: 'error',
          error: {
            code: 'CONNECTION_FAILED',
            message: error instanceof Error ? error.message : 'Connection failed',
          },
        }
        return
      }
    }

    // Get or create context for this tab
    const contextId = this.getContextId(tabId)

    const message: A2AMessage = {
      role: 'user',
      parts: [{ kind: 'text', text: content }],
      messageId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }

    yield* adapter.sendMessage(message, contextId)
  }

  async cancelTask(agentId: string, taskId: string): Promise<void> {
    const adapter = this.adapters.get(agentId)
    if (adapter) {
      await adapter.cancelTask(taskId)
    }
  }

  clearContext(tabId: string): void {
    const contextId = this.activeContexts.get(tabId)
    if (contextId) {
      this.contextProjectPaths.delete(contextId)
    }
    this.activeContexts.delete(tabId)
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.adapters.values()).map((adapter) =>
      adapter.disconnect().catch(() => {})
    )
    await Promise.all(disconnectPromises)
    this.activeContexts.clear()
  }
}

// Singleton instance
let agentManagerInstance: AgentManager | null = null

export function getAgentManager(): AgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new AgentManager()
  }
  return agentManagerInstance
}
