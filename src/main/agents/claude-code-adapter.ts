import { EventEmitter } from 'node:events'
import http from 'node:http'
import type { A2AMessage, AgentAdapter, AgentCapabilities, AgentEvent } from '../../types/a2a'

// Claude Agent SDK types (imported dynamically to avoid bundling issues)
type ClaudeAgentSDK = typeof import('@anthropic-ai/claude-agent-sdk')
type Query = ReturnType<ClaudeAgentSDK['query']>

const DEFAULT_PORT = 50003

/**
 * ClaudeCodeAdapter - A2A adapter for Claude Code
 *
 * Creates a local A2A-compatible HTTP server that wraps the Claude Agent SDK.
 * This allows Claude Code to be used through the same A2A interface as other agents.
 */
export class ClaudeCodeAdapter extends EventEmitter implements AgentAdapter {
  readonly id = 'claude-code'
  readonly name = 'Claude Code'
  readonly capabilities: AgentCapabilities = {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task'],
  }

  private server: http.Server | null = null
  private serverUrl: string | null = null
  private connected = false
  private sessions: Map<string, { query: Query; abortController: AbortController }> = new Map() // contextId -> session

  async connect(): Promise<void> {
    if (this.connected && this.serverUrl) return

    await this.startServer()
  }

  async disconnect(): Promise<void> {
    // Abort all active sessions
    for (const [, session] of this.sessions) {
      session.abortController.abort()
      session.query.close()
    }
    this.sessions.clear()

    if (this.server) {
      this.server.close()
      this.server = null
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

  async cancelTask(taskId: string): Promise<void> {
    // Find and abort the session for this task
    for (const [contextId, session] of this.sessions) {
      // We use contextId as a proxy for task identification
      if (contextId === taskId) {
        session.abortController.abort()
        session.query.close()
        this.sessions.delete(contextId)
        break
      }
    }
  }

  private async startServer(): Promise<void> {
    this.emit('status', { status: 'connecting' })

    try {
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
          console.log('[Claude Code A2A] Server started on', this.serverUrl)
          this.emit('status', { status: 'connected', serverUrl: this.serverUrl })
          resolve()
        })

        this.server!.on('error', (err) => {
          console.error('[Claude Code A2A] Server error:', err)
          this.connected = false
          this.emit('status', { status: 'error', error: err.message })
          reject(err)
        })
      })
    } catch (error) {
      console.error('[Claude Code A2A] Failed to start:', error)
      this.emit('status', {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start Claude Code',
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
      name: 'Claude Code',
      description: "Anthropic's coding agent powered by Claude Agent SDK",
      url: this.serverUrl,
      provider: {
        organization: 'Anthropic',
        url: 'https://anthropic.com',
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
          description: 'Generate, modify, and explain code using Claude',
          tags: ['code', 'development', 'programming'],
        },
        {
          id: 'file_operations',
          name: 'File Operations',
          description: 'Read, write, and edit files',
          tags: ['files', 'edit', 'read', 'write'],
        },
        {
          id: 'shell_commands',
          name: 'Shell Commands',
          description: 'Execute shell commands for development tasks',
          tags: ['bash', 'shell', 'terminal'],
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
      console.log('[Claude Code A2A] Request:', JSON.stringify(request, null, 2))

      if (request.method === 'message/stream') {
        await this.handleMessageStream(request, res)
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: -32601, message: 'Method not found' } }))
      }
    } catch (error) {
      console.error('[Claude Code A2A] Error:', error)
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
      // Dynamically import Claude Agent SDK
      const { query } = await import('@anthropic-ai/claude-agent-sdk')

      // Create abort controller for this session
      const abortController = new AbortController()

      // Get working directory from config or use current directory
      const cwd = process.cwd()

      // Send working status
      this.sendSSE(res, requestId, {
        kind: 'status-update',
        taskId,
        contextId,
        status: { state: 'working', timestamp: new Date().toISOString() },
        final: false,
      })

      // Check if we have an existing session for this context
      const existingSession = this.sessions.get(contextId)
      if (existingSession) {
        // Close the existing session
        existingSession.abortController.abort()
        existingSession.query.close()
      }

      // Create new query with Claude Agent SDK
      // Use bypassPermissions to avoid permission prompts in automated mode
      const queryInstance = query({
        prompt: text,
        options: {
          cwd,
          abortController,
          model: 'claude-sonnet-4-20250514',
          // Bypass all permission checks for automated operation
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          // Pre-allow common tools
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
          includePartialMessages: true,
          // Pass environment variables including auth token
          // Claude Agent SDK uses ANTHROPIC_AUTH_TOKEN (not ANTHROPIC_API_KEY)
          env: {
            ...process.env,
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          },
        },
      })

      // Store the session
      this.sessions.set(contextId, { query: queryInstance, abortController })

      console.log('[Claude Code A2A] Starting to iterate SDK messages...')

      // Process SDK messages
      let currentTextContent = ''
      let messageCount = 0

      for await (const sdkMessage of queryInstance) {
        messageCount++
        if (!sdkMessage) {
          console.log('[Claude Code A2A] Received null/undefined message')
          continue
        }

        // Log full message for debugging
        console.log(
          `[Claude Code A2A] SDK Message #${messageCount}:`,
          sdkMessage.type,
          JSON.stringify(sdkMessage, null, 2).slice(0, 500)
        )

        // Handle different message types
        switch (sdkMessage.type) {
          case 'assistant': {
            // Full assistant message - extract text content
            const assistantMsg = sdkMessage as {
              type: 'assistant'
              message: {
                content: Array<{ type: string; text?: string }>
              }
            }

            for (const block of assistantMsg.message.content) {
              if (block.type === 'text' && block.text) {
                const newText = block.text.slice(currentTextContent.length)
                if (newText) {
                  currentTextContent = block.text
                  this.sendSSE(res, requestId, {
                    kind: 'status-update',
                    taskId,
                    contextId,
                    status: {
                      state: 'working',
                      message: {
                        kind: 'message',
                        role: 'agent',
                        parts: [{ kind: 'text', text: newText }],
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
              } else if (block.type === 'tool_use') {
                // Tool use block
                const toolBlock = block as { type: 'tool_use'; name: string; input: unknown }
                this.sendSSE(res, requestId, {
                  kind: 'status-update',
                  taskId,
                  contextId,
                  status: {
                    state: 'working',
                    message: {
                      kind: 'message',
                      role: 'agent',
                      parts: [
                        {
                          kind: 'text',
                          text: `Using tool: ${toolBlock.name}`,
                        },
                      ],
                      messageId: crypto.randomUUID(),
                      taskId,
                      contextId,
                      metadata: { itemType: 'tool_call', toolName: toolBlock.name },
                    },
                    timestamp: new Date().toISOString(),
                  },
                  final: false,
                })
              } else if (block.type === 'thinking') {
                // Thinking/reasoning block
                const thinkingBlock = block as { type: 'thinking'; thinking: string }
                if (thinkingBlock.thinking) {
                  this.sendSSE(res, requestId, {
                    kind: 'status-update',
                    taskId,
                    contextId,
                    status: {
                      state: 'working',
                      message: {
                        kind: 'message',
                        role: 'agent',
                        parts: [{ kind: 'text', text: thinkingBlock.thinking }],
                        messageId: crypto.randomUUID(),
                        taskId,
                        contextId,
                        metadata: { itemType: 'reasoning' },
                      },
                      timestamp: new Date().toISOString(),
                    },
                    final: false,
                  })
                }
              }
            }
            // Reset for next message
            currentTextContent = ''
            break
          }

          case 'stream_event': {
            // Streaming event - handle partial messages
            const streamEvent = sdkMessage as {
              type: 'stream_event'
              event: {
                type: string
                delta?: { type: string; text?: string }
                index?: number
                content_block?: { type: string; text?: string }
              }
            }

            if (
              streamEvent.event.type === 'content_block_delta' &&
              streamEvent.event.delta?.type === 'text_delta' &&
              streamEvent.event.delta.text
            ) {
              this.sendSSE(res, requestId, {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                  state: 'working',
                  message: {
                    kind: 'message',
                    role: 'agent',
                    parts: [{ kind: 'text', text: streamEvent.event.delta.text }],
                    messageId: crypto.randomUUID(),
                    taskId,
                    contextId,
                    metadata: { itemType: 'agent_message' },
                  },
                  timestamp: new Date().toISOString(),
                },
                final: false,
              })
            } else if (
              streamEvent.event.type === 'content_block_delta' &&
              streamEvent.event.delta?.type === 'thinking_delta' &&
              (streamEvent.event.delta as { thinking?: string }).thinking
            ) {
              this.sendSSE(res, requestId, {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                  state: 'working',
                  message: {
                    kind: 'message',
                    role: 'agent',
                    parts: [
                      {
                        kind: 'text',
                        text: (streamEvent.event.delta as { thinking: string }).thinking,
                      },
                    ],
                    messageId: crypto.randomUUID(),
                    taskId,
                    contextId,
                    metadata: { itemType: 'reasoning' },
                  },
                  timestamp: new Date().toISOString(),
                },
                final: false,
              })
            }
            break
          }

          case 'result': {
            // Query result - check if successful
            const resultMsg = sdkMessage as {
              type: 'result'
              subtype: string
              result?: string
              errors?: string[]
            }

            if (resultMsg.subtype === 'success' && resultMsg.result) {
              // Send final result if there's any content
              this.sendSSE(res, requestId, {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                  state: 'working',
                  message: {
                    kind: 'message',
                    role: 'agent',
                    parts: [{ kind: 'text', text: resultMsg.result }],
                    messageId: crypto.randomUUID(),
                    taskId,
                    contextId,
                    metadata: { itemType: 'agent_message' },
                  },
                  timestamp: new Date().toISOString(),
                },
                final: false,
              })
            } else if (
              resultMsg.subtype.startsWith('error') &&
              resultMsg.errors &&
              resultMsg.errors.length > 0
            ) {
              this.sendSSE(res, requestId, {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                  state: 'failed',
                  message: {
                    kind: 'message',
                    role: 'agent',
                    parts: [{ kind: 'text', text: `Error: ${resultMsg.errors.join('\n')}` }],
                    messageId: crypto.randomUUID(),
                    taskId,
                    contextId,
                  },
                  timestamp: new Date().toISOString(),
                },
                final: true,
              })
              res.end()
              return
            }
            break
          }

          case 'system': {
            // System messages (init, status, etc.)
            const sysMsg = sdkMessage as {
              type: 'system'
              subtype: string
              model?: string
              tools?: string[]
              permissionMode?: string
            }
            console.log('[Claude Code A2A] System message:', sysMsg.subtype)

            // Log useful init info
            if (sysMsg.subtype === 'init') {
              console.log('[Claude Code A2A] Init - Model:', sysMsg.model)
              console.log('[Claude Code A2A] Init - Tools:', sysMsg.tools)
              console.log('[Claude Code A2A] Init - Permission Mode:', sysMsg.permissionMode)
            }
            break
          }

          case 'auth_status': {
            // Authentication status
            const authMsg = sdkMessage as {
              type: 'auth_status'
              isAuthenticating: boolean
              error?: string
            }
            console.log('[Claude Code A2A] Auth status:', authMsg.isAuthenticating, authMsg.error)

            if (authMsg.error) {
              this.sendSSE(res, requestId, {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                  state: 'failed',
                  message: {
                    kind: 'message',
                    role: 'agent',
                    parts: [{ kind: 'text', text: `Authentication error: ${authMsg.error}` }],
                    messageId: crypto.randomUUID(),
                    taskId,
                    contextId,
                  },
                  timestamp: new Date().toISOString(),
                },
                final: true,
              })
              res.end()
              return
            }
            break
          }

          case 'tool_progress': {
            // Tool progress update
            const progressMsg = sdkMessage as {
              type: 'tool_progress'
              tool_name: string
              elapsed_time_seconds: number
            }
            this.sendSSE(res, requestId, {
              kind: 'status-update',
              taskId,
              contextId,
              status: {
                state: 'working',
                message: {
                  kind: 'message',
                  role: 'agent',
                  parts: [
                    {
                      kind: 'text',
                      text: `Running ${progressMsg.tool_name}... (${progressMsg.elapsed_time_seconds.toFixed(1)}s)`,
                    },
                  ],
                  messageId: crypto.randomUUID(),
                  taskId,
                  contextId,
                  metadata: { itemType: 'tool_call', toolName: progressMsg.tool_name },
                },
                timestamp: new Date().toISOString(),
              },
              final: false,
            })
            break
          }

          case 'user': {
            // User message replay (during resume)
            console.log('[Claude Code A2A] User message (replay)')
            break
          }

          default: {
            // Log unknown message types for debugging
            console.log(
              '[Claude Code A2A] Unknown message type:',
              (sdkMessage as { type: string }).type
            )
          }
        }
      }

      console.log(`[Claude Code A2A] Message loop ended. Total messages: ${messageCount}`)

      // Clean up session
      this.sessions.delete(contextId)

      // Send completion
      this.sendSSE(res, requestId, {
        kind: 'status-update',
        taskId,
        contextId,
        status: { state: 'completed', timestamp: new Date().toISOString() },
        final: true,
      })
    } catch (error) {
      console.error('[Claude Code A2A] Stream error:', error)
      console.error(
        '[Claude Code A2A] Error stack:',
        error instanceof Error ? error.stack : 'No stack'
      )

      // Clean up session on error
      this.sessions.delete(contextId)

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
