import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
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

  private serverProcess: ChildProcess | null = null
  private connected = false
  private serverUrl: string | null = null

  async connect(): Promise<void> {
    if (this.connected && this.serverUrl) return

    await this.startServer()
  }

  async disconnect(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill()
      this.serverProcess = null
    }
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
    return new Promise((resolve, reject) => {
      this.emit('status', { status: 'connecting' })

      // Start gemini-cli-a2a-server (it uses a random port)
      this.serverProcess = spawn('npx', ['gemini-cli-a2a-server'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      })

      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'))
      }, 30000)

      this.serverProcess.stdout?.on('data', async (data) => {
        const output = data.toString()
        console.log('[Gemini A2A]', output)

        // Parse server URL from output
        // Example: "[CoreAgent] Agent Server started on http://localhost:57240"
        const urlMatch = output.match(/Agent Server started on (http:\/\/[^\s]+)/)
        if (urlMatch) {
          this.serverUrl = urlMatch[1]
          console.log('[Gemini A2A] Parsed server URL:', this.serverUrl)
          clearTimeout(timeout)
          this.connected = true
          this.emit('status', { status: 'connected', serverUrl: this.serverUrl })
          resolve()
        }
      })

      this.serverProcess.stderr?.on('data', (data) => {
        console.error('[Gemini A2A Error]', data.toString())
      })

      this.serverProcess.on('error', (err) => {
        clearTimeout(timeout)
        this.connected = false
        this.serverUrl = null
        this.emit('status', { status: 'error', error: err.message })
        reject(err)
      })

      this.serverProcess.on('exit', (code) => {
        this.connected = false
        this.serverProcess = null
        this.serverUrl = null
        if (code !== 0) {
          this.emit('status', { status: 'disconnected' })
        }
      })
    })
  }
}
