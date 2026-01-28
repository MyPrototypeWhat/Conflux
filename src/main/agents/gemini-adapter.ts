import { EventEmitter } from 'node:events'
import type { Server } from 'node:http'
import { createApp, updateCoderAgentCardUrl } from '@google/gemini-cli-a2a-server'
import type { A2AMessage, AgentAdapter, AgentCapabilities, AgentEvent } from '../../types/a2a'

/**
 * GeminiAdapter - Main process side
 * Only responsible for:
 * - Starting/stopping the A2A server process
 * - Parsing dynamic port from server output
 * - Providing server URL to renderer
 *
 * Actual A2A communication happens in renderer process for easier debugging
 */
export class GeminiAdapter extends EventEmitter implements AgentAdapter {
  readonly id = 'gemini-cli'
  readonly name = 'Gemini CLI'
  readonly capabilities: AgentCapabilities = {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  }

  private server: Server | null = null
  private connected = false
  private serverUrl: string | null = null

  async connect(): Promise<void> {
    if (this.connected && this.serverUrl) return

    await this.startServer()
  }

  async disconnect(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => resolve())
      this.server = null
    })
    this.connected = false
    this.serverUrl = null
    this.emit('status', { status: 'disconnected' })
  }

  isConnected(): boolean {
    return this.connected && this.serverUrl !== null
  }

  getServerUrl(): string | null {
    return this.serverUrl
  }

  // Message sending is now handled in renderer process
  // This is kept for interface compatibility but delegates to renderer
  async *sendMessage(
    _message: A2AMessage,
    _contextId?: string
  ): AsyncGenerator<AgentEvent, void, unknown> {
    yield {
      type: 'error',
      error: {
        code: 'USE_RENDERER',
        message:
          'Message sending should be done in renderer process. Use getServerUrl() to get the server URL.',
      },
    }
  }

  async cancelTask(_taskId: string): Promise<void> {
    // Cancel is handled in renderer process
  }

  private async startServer(): Promise<void> {
    this.emit('status', { status: 'connecting' })

    try {
      const app = await createApp()
      const server = app.listen(0, 'localhost')
      this.server = server

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server startup timeout'))
        }, 30000)

        server.on('listening', () => {
          clearTimeout(timeout)
          const address = server.address()
          if (!address || typeof address === 'string') {
            reject(new Error('Failed to resolve server port'))
            return
          }

          updateCoderAgentCardUrl(address.port)
          this.serverUrl = `http://localhost:${address.port}`
          this.connected = true
          console.log('[Gemini A2A] Server started on', this.serverUrl)
          this.emit('status', { status: 'connected', serverUrl: this.serverUrl })
          resolve()
        })

        server.on('error', (err) => {
          clearTimeout(timeout)
          this.connected = false
          this.serverUrl = null
          this.emit('status', { status: 'error', error: err.message })
          reject(err)
        })
      })
    } catch (error) {
      this.connected = false
      this.serverUrl = null
      this.emit('status', {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start Gemini A2A server',
      })
      throw error
    }
  }
}
