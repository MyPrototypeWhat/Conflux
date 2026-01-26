import { EventEmitter } from 'node:events'
import http from 'node:http'
import type { A2AMessage, AgentAdapter, AgentCapabilities, AgentEvent } from '../../types/a2a'

// Codex SDK types (will be imported dynamically to avoid bundling issues)
type CodexSDK = typeof import('@openai/codex-sdk')
type Codex = InstanceType<CodexSDK['Codex']>
type Thread = ReturnType<Codex['startThread']>

// ThreadItem types from @openai/codex-sdk
interface AgentMessageItem {
  id: string
  type: 'agent_message'
  text: string
}

interface ReasoningItem {
  id: string
  type: 'reasoning'
  text: string
}

interface CommandExecutionItem {
  id: string
  type: 'command_execution'
  command: string
  aggregated_output: string
  exit_code?: number
  status: 'in_progress' | 'completed' | 'failed'
}

interface FileChangeItem {
  id: string
  type: 'file_change'
  changes: Array<{ path: string; kind: 'add' | 'delete' | 'update' }>
  status: 'completed' | 'failed'
}

interface McpToolCallItem {
  id: string
  type: 'mcp_tool_call'
  server: string
  tool: string
  arguments: unknown
  result?: { content: unknown[]; structured_content: unknown }
  error?: { message: string }
  status: 'in_progress' | 'completed' | 'failed'
}

interface WebSearchItem {
  id: string
  type: 'web_search'
  query: string
}

interface TodoListItem {
  id: string
  type: 'todo_list'
  items: Array<{ text: string; completed: boolean }>
}

interface ErrorItem {
  id: string
  type: 'error'
  message: string
}

type ThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem

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

      // Track sent content for each item to calculate delta
      const sentTextLengths = new Map<string, number>()
      const sentItemStates = new Map<string, string>() // Track last sent state for non-text items

      for await (const event of events) {
        console.log('[Codex A2A] Event:', event.type, JSON.stringify(event, null, 2))

        // Handle item events
        if (event.type === 'item.updated' || event.type === 'item.completed') {
          const item = event.item as ThreadItem & {
            content?: Array<{ type: string; text?: string }>
          }
          const isCompleted = event.type === 'item.completed'

          switch (item.type) {
            // Text-based items with streaming support
            case 'agent_message':
            case 'reasoning': {
              const textItem = item as AgentMessageItem | ReasoningItem
              if (textItem.text) {
                const prevLength = sentTextLengths.get(textItem.id) || 0
                const deltaText = textItem.text.slice(prevLength)

                if (deltaText.length > 0) {
                  sentTextLengths.set(textItem.id, textItem.text.length)
                  this.sendItemMessage(res, requestId, taskId, contextId, {
                    text: deltaText,
                    itemType: textItem.type,
                  })
                }
              }
              break
            }

            // Command execution - show command and output
            case 'command_execution': {
              const cmdItem = item as CommandExecutionItem
              const stateKey = `${cmdItem.id}:state`
              const outputKey = `${cmdItem.id}:output`
              const lastState = sentItemStates.get(stateKey)

              // Send command start notification (only once)
              // Content is empty - command is in metadata, rendered by frontend
              if (!lastState) {
                sentItemStates.set(stateKey, 'started')
                this.sendItemMessage(res, requestId, taskId, contextId, {
                  text: '', // Empty - just to create the block
                  itemType: 'command_execution',
                  metadata: { command: cmdItem.command, status: cmdItem.status },
                })
              }

              // Stream output incrementally
              if (cmdItem.aggregated_output) {
                const prevLength = sentTextLengths.get(outputKey) || 0
                const deltaOutput = cmdItem.aggregated_output.slice(prevLength)

                if (deltaOutput.length > 0) {
                  sentTextLengths.set(outputKey, cmdItem.aggregated_output.length)
                  this.sendItemMessage(res, requestId, taskId, contextId, {
                    text: deltaOutput,
                    itemType: 'command_output',
                    metadata: { command: cmdItem.command },
                  })
                }
              }

              // Send completion status (metadata only, no extra text)
              if (isCompleted && lastState !== 'completed') {
                sentItemStates.set(stateKey, 'completed')
                this.sendItemMessage(res, requestId, taskId, contextId, {
                  text: '', // Empty - status is in metadata
                  itemType: 'command_status',
                  metadata: {
                    command: cmdItem.command,
                    status: cmdItem.status,
                    exitCode: cmdItem.exit_code,
                  },
                })
              }
              break
            }

            // File changes - show file operations
            case 'file_change': {
              const fileItem = item as FileChangeItem
              if (isCompleted) {
                const changeLines = fileItem.changes
                  .map((c) => {
                    const icon = c.kind === 'add' ? '+' : c.kind === 'delete' ? '-' : '~'
                    return `  ${icon} ${c.path}`
                  })
                  .join('\n')
                const statusIcon = fileItem.status === 'completed' ? '✓' : '✗'
                this.sendItemMessage(res, requestId, taskId, contextId, {
                  text: `\n**File Changes** [${statusIcon}]\n${changeLines}\n`,
                  itemType: 'file_change',
                  metadata: { changes: fileItem.changes, status: fileItem.status },
                })
              }
              break
            }

            // MCP tool calls
            case 'mcp_tool_call': {
              const mcpItem = item as McpToolCallItem
              const stateKey = `${mcpItem.id}:state`
              const lastState = sentItemStates.get(stateKey)

              // Send tool call start
              if (!lastState) {
                sentItemStates.set(stateKey, 'started')
                this.sendItemMessage(res, requestId, taskId, contextId, {
                  text: `\n**MCP Tool Call**: ${mcpItem.server}/${mcpItem.tool}\n`,
                  itemType: 'mcp_tool_call',
                  metadata: {
                    server: mcpItem.server,
                    tool: mcpItem.tool,
                    arguments: mcpItem.arguments,
                    status: mcpItem.status,
                  },
                })
              }

              // Send completion with result or error
              if (isCompleted && lastState !== 'completed') {
                sentItemStates.set(stateKey, 'completed')
                if (mcpItem.error) {
                  this.sendItemMessage(res, requestId, taskId, contextId, {
                    text: `[✗ MCP Error: ${mcpItem.error.message}]\n`,
                    itemType: 'mcp_tool_error',
                    metadata: { error: mcpItem.error },
                  })
                } else if (mcpItem.result) {
                  this.sendItemMessage(res, requestId, taskId, contextId, {
                    text: `[✓ MCP Tool completed]\n`,
                    itemType: 'mcp_tool_result',
                    metadata: { result: mcpItem.result },
                  })
                }
              }
              break
            }

            // Web search
            case 'web_search': {
              const searchItem = item as WebSearchItem
              this.sendItemMessage(res, requestId, taskId, contextId, {
                text: `\n**Web Search**: "${searchItem.query}"\n`,
                itemType: 'web_search',
                metadata: { query: searchItem.query },
              })
              break
            }

            // Todo list
            case 'todo_list': {
              const todoItem = item as TodoListItem
              const todoLines = todoItem.items
                .map((t) => `  ${t.completed ? '☑' : '☐'} ${t.text}`)
                .join('\n')
              this.sendItemMessage(res, requestId, taskId, contextId, {
                text: `\n**Todo List**:\n${todoLines}\n`,
                itemType: 'todo_list',
                metadata: { items: todoItem.items },
              })
              break
            }

            // Error
            case 'error': {
              const errorItem = item as ErrorItem
              this.sendItemMessage(res, requestId, taskId, contextId, {
                text: `\n**Error**: ${errorItem.message}\n`,
                itemType: 'error',
                metadata: { message: errorItem.message },
              })
              break
            }

            default: {
              // Handle legacy message format with content array
              if ('content' in item && Array.isArray(item.content)) {
                for (const content of item.content) {
                  if (content.type === 'output_text' && content.text) {
                    const contentKey = `${item.id}:${content.type}`
                    const prevLength = sentTextLengths.get(contentKey) || 0
                    const deltaText = content.text.slice(prevLength)

                    if (deltaText.length > 0) {
                      sentTextLengths.set(contentKey, content.text.length)
                      this.sendItemMessage(res, requestId, taskId, contextId, {
                        text: deltaText,
                        itemType: 'agent_message',
                      })
                    }
                  }
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

  private sendItemMessage(
    res: http.ServerResponse,
    requestId: string,
    taskId: string,
    contextId: string,
    options: {
      text: string
      itemType: string
      metadata?: Record<string, unknown>
    }
  ): void {
    this.sendSSE(res, requestId, {
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'working',
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: options.text }],
          messageId: crypto.randomUUID(),
          taskId,
          contextId,
          metadata: { itemType: options.itemType, ...options.metadata },
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    })
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
