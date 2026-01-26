import { EventEmitter } from 'node:events'
import http from 'node:http'
import type { A2AMessage, AgentAdapter, AgentCapabilities, AgentEvent } from '../../types/a2a'

// Codex SDK types (will be imported dynamically to avoid bundling issues)
type CodexSDK = typeof import('@openai/codex-sdk')
type Codex = InstanceType<CodexSDK['Codex']>
type Thread = ReturnType<Codex['startThread']>

const DEFAULT_PORT = 50002

/**
 * CodexAdapter - A2A adapter for OpenAI Codex
 *
 * Creates a local A2A-compatible HTTP server that wraps the Codex SDK.
 * This allows Codex to be used through the same A2A interface as other agents.
 */
export class CodexAdapter extends EventEmitter implements AgentAdapter {
  readonly id = 'codex'
  readonly name = 'Codex'
  readonly capabilities: AgentCapabilities = {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  }

  private server: http.Server | null = null
  private serverUrl: string | null = null
  private connected = false
  private codex: Codex | null = null
  private threads: Map<string, Thread> = new Map() // contextId -> Thread

  async connect(): Promise<void> {
    if (this.connected && this.serverUrl) return

    await this.startServer()
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.connected = false
    this.serverUrl = null
    this.codex = null
    this.threads.clear()
    this.emit('status', { status: 'disconnected' })
  }

  isConnected(): boolean {
    return this.connected && this.serverUrl !== null
  }

  getServerUrl(): string | null {
    return this.serverUrl
  }

  // Message sending is handled via HTTP server
  async *sendMessage(
    _message: A2AMessage,
    _contextId?: string
  ): AsyncGenerator<AgentEvent, void, unknown> {
    yield {
      type: 'error',
      error: {
        code: 'USE_RENDERER',
        message:
          'Message sending should be done via HTTP. Use getServerUrl() to get the server URL.',
      },
    }
  }

  async cancelTask(_taskId: string): Promise<void> {
    // TODO: Implement task cancellation
  }

  private async startServer(): Promise<void> {
    this.emit('status', { status: 'connecting' })

    try {
      // Dynamically import Codex SDK
      const { Codex } = await import('@openai/codex-sdk')
      this.codex = new Codex({
        env: {
          ...process.env,
          // Ensure PATH is available for Codex CLI
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        },
      })

      // Find available port
      const port = await this.findAvailablePort(DEFAULT_PORT)

      // Create HTTP server
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      return new Promise((resolve, reject) => {
        this.server!.listen(port, () => {
          this.serverUrl = `http://localhost:${port}`
          this.connected = true
          console.log('[Codex A2A] Server started on', this.serverUrl)
          this.emit('status', { status: 'connected', serverUrl: this.serverUrl })
          resolve()
        })

        this.server!.on('error', (err) => {
          console.error('[Codex A2A] Server error:', err)
          this.connected = false
          this.emit('status', { status: 'error', error: err.message })
          reject(err)
        })
      })
    } catch (error) {
      console.error('[Codex A2A] Failed to start:', error)
      this.emit('status', {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start Codex',
      })
      throw error
    }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve) => {
      const server = http.createServer()
      server.listen(startPort, () => {
        server.close(() => resolve(startPort))
      })
      server.on('error', () => {
        resolve(this.findAvailablePort(startPort + 1))
      })
    })
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Handle agent card
    if (req.url === '/.well-known/agent-card.json' && req.method === 'GET') {
      this.handleAgentCard(res)
      return
    }

    // Handle A2A JSON-RPC
    if (req.method === 'POST') {
      this.handleJsonRpc(req, res)
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  }

  private handleAgentCard(res: http.ServerResponse): void {
    const card = {
      name: 'Codex',
      description: "OpenAI's coding agent powered by Codex SDK",
      url: this.serverUrl,
      provider: {
        organization: 'OpenAI',
        url: 'https://openai.com',
      },
      protocolVersion: '0.3.0',
      version: '0.1.0',
      capabilities: this.capabilities,
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      skills: [
        {
          id: 'code_generation',
          name: 'Code Generation',
          description: 'Generate, modify, and explain code',
          tags: ['code', 'development', 'programming'],
        },
      ],
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(card))
  }

  private async handleJsonRpc(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }

    try {
      const request = JSON.parse(body)
      console.log('[Codex A2A] Request:', JSON.stringify(request, null, 2))

      if (request.method === 'message/stream') {
        await this.handleMessageStream(request, res)
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: -32601, message: 'Method not found' } }))
      }
    } catch (error) {
      console.error('[Codex A2A] Error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
        })
      )
    }
  }

  private async handleMessageStream(
    request: { id: string; params: { contextId: string; message: A2AMessage } },
    res: http.ServerResponse
  ): Promise<void> {
    const { id: requestId, params } = request
    const { contextId, message } = params

    // Extract text from message parts
    const text = message.parts
      .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
      .map((p) => p.text)
      .join('\n')

    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: -32602, message: 'No text content' } }))
      return
    }

    // Set up SSE response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const taskId = crypto.randomUUID()

    // Send initial task event
    this.sendSSE(res, requestId, {
      kind: 'task',
      id: taskId,
      contextId,
      status: { state: 'submitted', timestamp: new Date().toISOString() },
    })

    try {
      // Get or create thread for this context
      let thread = this.threads.get(contextId)
      if (!thread) {
        thread = this.codex!.startThread({
          skipGitRepoCheck: true, // Allow running outside git repos
        })
        this.threads.set(contextId, thread)
      }

      // Send working status
      this.sendSSE(res, requestId, {
        kind: 'status-update',
        taskId,
        contextId,
        status: { state: 'working', timestamp: new Date().toISOString() },
        final: false,
      })

      // Run Codex with streaming
      const { events } = await thread.runStreamed(text)

      // Track sent text length for each item to calculate delta
      const sentTextLengths = new Map<string, number>()

      for await (const event of events) {
        console.log('[Codex A2A] Event:', event.type, JSON.stringify(event, null, 2))

        // Handle both item.updated and item.completed for streaming
        if (event.type === 'item.updated' || event.type === 'item.completed') {
          const item = event.item as {
            id: string
            type: string
            text?: string
            content?: Array<{ type: string; text?: string }>
          }

          // Handle agent_message and reasoning items
          if ((item.type === 'agent_message' || item.type === 'reasoning') && item.text) {
            const prevLength = sentTextLengths.get(item.id) || 0
            const deltaText = item.text.slice(prevLength)

            console.log(
              `[Codex A2A] Item ${item.id} (${item.type}): prev=${prevLength}, current=${item.text.length}, delta=${deltaText.length}`
            )

            // Only send if there's new content
            if (deltaText.length > 0) {
              sentTextLengths.set(item.id, item.text.length)

              this.sendSSE(res, requestId, {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                  state: 'working',
                  message: {
                    kind: 'message',
                    role: 'agent',
                    parts: [{ kind: 'text', text: deltaText }],
                    messageId: crypto.randomUUID(),
                    taskId,
                    contextId,
                    metadata: { itemType: item.type },
                  },
                  timestamp: new Date().toISOString(),
                },
                final: false,
              })
            }
          }

          // Handle message items with content array (alternative format)
          if (item.type === 'message' && item.content) {
            for (const content of item.content) {
              if (content.type === 'output_text' && content.text) {
                const contentKey = `${item.id}:${content.type}`
                const prevLength = sentTextLengths.get(contentKey) || 0
                const deltaText = content.text.slice(prevLength)

                if (deltaText.length > 0) {
                  sentTextLengths.set(contentKey, content.text.length)

                  this.sendSSE(res, requestId, {
                    kind: 'status-update',
                    taskId,
                    contextId,
                    status: {
                      state: 'working',
                      message: {
                        kind: 'message',
                        role: 'agent',
                        parts: [{ kind: 'text', text: deltaText }],
                        messageId: crypto.randomUUID(),
                        taskId,
                        contextId,
                        metadata: { itemType: 'agent_message' },
                      },
                      timestamp: new Date().toISOString(),
                    },
                    final: false,
                  })
                }
              }
            }
          }
        }
      }

      // Send completion
      this.sendSSE(res, requestId, {
        kind: 'status-update',
        taskId,
        contextId,
        status: { state: 'completed', timestamp: new Date().toISOString() },
        final: true,
      })
    } catch (error) {
      console.error('[Codex A2A] Stream error:', error)
      this.sendSSE(res, requestId, {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            messageId: crypto.randomUUID(),
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
      })
    }

    res.end()
  }

  private sendSSE(res: http.ServerResponse, requestId: string, result: unknown): void {
    const event = {
      jsonrpc: '2.0',
      id: requestId,
      result,
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}
