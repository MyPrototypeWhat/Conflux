import { EventEmitter } from 'node:events'
import { type CodexConfig as CodexA2AConfig, CodexA2AServer } from 'codex-a2a'
import type {
  A2AMessage,
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentStatusUpdate,
} from '../../types/a2a'
import { getAgentManager } from '../agent-manager'
import { getConfigRepository } from '../storage'

/**
 * CodexAdapter - A2A adapter for OpenAI Codex
 */
export class CodexAdapter extends EventEmitter implements AgentAdapter {
  readonly id = 'codex'
  readonly name = 'Codex'
  readonly capabilities: AgentCapabilities = {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  }

  private server: CodexA2AServer | null = null
  private connected = false
  private serverUrl: string | null = null
  private configRepo = getConfigRepository()

  async connect(): Promise<void> {
    if (this.connected && this.serverUrl) return

    this.emit('status', { status: 'connecting' })

    const server = this.ensureServer()
    try {
      await server.start()
      this.serverUrl = server.getUrl()
      this.connected = true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Codex'
      this.connected = false
      this.serverUrl = null
      this.emit('status', { status: 'error', error: message })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (!this.server) return
    await this.server.stop()
    this.connected = false
    this.serverUrl = null
  }

  isConnected(): boolean {
    return this.connected && this.serverUrl !== null
  }

  getServerUrl(): string | null {
    return this.serverUrl
  }

  async *sendMessage(
    _message: A2AMessage,
    _contextId?: string
  ): AsyncGenerator<AgentEvent, void, unknown> {
    yield {
      type: 'error',
      error: {
        code: 'USE_RENDERER',
        message:
          'Message sending should be done via A2A HTTP. Use getServerUrl() to get the server URL.',
      },
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    if (!this.server) return
    await this.server.cancelTask(taskId)
  }

  private ensureServer(): CodexA2AServer {
    if (this.server) return this.server

    const server = new CodexA2AServer({
      getConfig: (contextId) => this.getCodexConfig(contextId),
      getWorkingDirectory: (contextId) => this.getWorkingDirectory(contextId),
      logger: console,
    })

    server.on('status', (status: AgentStatusUpdate & { serverUrl?: string }) => {
      if (status.status === 'connected') {
        this.connected = true
        this.serverUrl = server.getUrl()
      }

      if (status.status === 'disconnected') {
        this.connected = false
        this.serverUrl = null
      }

      if (status.status === 'error') {
        this.connected = false
      }

      this.emit('status', status)
    })

    this.server = server
    return server
  }

  private getCodexConfig(contextId: string): Partial<CodexA2AConfig> {
    const projectPath = getAgentManager().getContextProjectPath(contextId)
    const config = this.configRepo.getCodexConfig(projectPath)
    const { enabled, ...rest } = config
    return rest as Partial<CodexA2AConfig>
  }

  private getWorkingDirectory(contextId: string): string | undefined {
    const projectPath = getAgentManager().getContextProjectPath(contextId)
    const config = this.configRepo.getCodexConfig(projectPath)
    const workingDirectory = config.workingDirectory?.trim()

    if (workingDirectory) return workingDirectory
    return projectPath || undefined
  }
}
