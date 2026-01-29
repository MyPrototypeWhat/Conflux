import { EventEmitter } from 'node:events'
import http from 'node:http'
import type { AgentCard, Message, Task, TaskStatusUpdateEvent } from '@a2a-js/sdk'
import { AGENT_CARD_PATH } from '@a2a-js/sdk'
import {
  type AgentExecutor,
  DefaultRequestHandler,
  type ExecutionEventBus,
  InMemoryTaskStore,
  type RequestContext,
} from '@a2a-js/sdk/server'
import {
  agentCardHandler,
  jsonRpcHandler,
  restHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express'
import type { Codex, Thread } from '@openai/codex-sdk'
import express from 'express'
import type { A2AMessage, AgentAdapter, AgentCapabilities, AgentEvent } from '../../types/a2a'

const DEFAULT_PORT = 50002

class CodexExecutor implements AgentExecutor {
  private threads: Map<string, Thread>
  private canceledTasks = new Set<string>()
  private taskContexts = new Map<string, string>()

  constructor(private codex: Codex) {
    this.threads = new Map()
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext
    const timestamp = new Date().toISOString()
    this.taskContexts.set(taskId, contextId)

    if (!task) {
      const initialTask: Task = {
        kind: 'task',
        id: taskId,
        contextId,
        status: { state: 'submitted', timestamp },
        history: [userMessage],
      }
      eventBus.publish(initialTask)
    }

    this.publishStatus(eventBus, taskId, contextId, 'working', false, undefined, 'state-change')

    if (this.canceledTasks.has(taskId)) {
      this.publishCanceled(eventBus, taskId, contextId)
      return
    }

    const text = userMessage.parts
      .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text')
      .map((part) => part.text)
      .join('\n')

    if (!text) {
      this.publishFailure(eventBus, taskId, contextId, 'No text content')
      return
    }

    let thread = this.threads.get(contextId)
    if (!thread) {
      thread = this.codex.startThread({
        skipGitRepoCheck: true,
        webSearchEnabled: true,
        networkAccessEnabled: true,
        webSearchMode: 'live',
      })
      this.threads.set(contextId, thread)
    }

    const { events } = await thread.runStreamed(text)
    const sentTextLengths = new Map<string, number>()
    const sentItemStates = new Map<string, string>()
    // TODO: Emit tool-call-confirmation + input-required when Codex exposes approval-required tools.

    for await (const event of events) {
      if (this.canceledTasks.has(taskId)) {
        this.publishCanceled(eventBus, taskId, contextId)
        return
      }
      console.log('[Codex A2A] event', event)
      if (event.type === 'item.updated' || event.type === 'item.completed') {
        const item = event.item
        const isCompleted = event.type === 'item.completed'

        switch (item.type) {
          case 'agent_message':
          case 'reasoning': {
            if (item.text) {
              const prevLength = sentTextLengths.get(item.id) || 0
              const deltaText = item.text.slice(prevLength)
              if (deltaText.length > 0) {
                sentTextLengths.set(item.id, item.text.length)
                if (item.type === 'reasoning') {
                  this.publishThought(eventBus, taskId, contextId, deltaText)
                } else {
                  this.publishTextContent(eventBus, taskId, contextId, deltaText)
                }
              }
            }
            break
          }
          case 'command_execution': {
            const stateKey = `${item.id}:state`
            const outputKey = `${item.id}:output`
            const lastState = sentItemStates.get(stateKey)

            if (!lastState) {
              sentItemStates.set(stateKey, 'started')
              this.publishToolUpdate(eventBus, taskId, contextId, {
                request: { callId: item.id, name: 'command_execution' },
                status: item.status,
                command: item.command,
              })
            }

            if (item.aggregated_output) {
              const prevLength = sentTextLengths.get(outputKey) || 0
              const deltaOutput = item.aggregated_output.slice(prevLength)
              if (deltaOutput.length > 0) {
                sentTextLengths.set(outputKey, item.aggregated_output.length)
                this.publishToolOutput(
                  eventBus,
                  taskId,
                  contextId,
                  item.id,
                  deltaOutput,
                  true,
                  isCompleted
                )
              }
            }

            if (isCompleted && lastState !== 'completed') {
              sentItemStates.set(stateKey, 'completed')
              this.publishToolUpdate(eventBus, taskId, contextId, {
                request: { callId: item.id, name: 'command_execution' },
                status: item.status,
                command: item.command,
                exitCode: item.exit_code,
              })
            }
            break
          }
          case 'file_change': {
            if (isCompleted) {
              this.publishToolUpdate(eventBus, taskId, contextId, {
                request: { callId: item.id, name: 'file_change' },
                status: item.status,
                changes: item.changes,
              })
            }
            break
          }
          case 'mcp_tool_call': {
            const stateKey = `${item.id}:state`
            const lastState = sentItemStates.get(stateKey)

            if (!lastState) {
              sentItemStates.set(stateKey, 'started')
              this.publishToolUpdate(eventBus, taskId, contextId, {
                request: { callId: item.id, name: 'mcp_tool_call' },
                status: item.status,
                server: item.server,
                tool: item.tool,
                arguments: item.arguments,
              })
            }

            if (isCompleted && lastState !== 'completed') {
              sentItemStates.set(stateKey, 'completed')
              if (item.error) {
                this.publishToolUpdate(eventBus, taskId, contextId, {
                  request: { callId: item.id, name: 'mcp_tool_call' },
                  status: 'failed',
                  error: item.error,
                })
              } else if (item.result) {
                this.publishToolOutput(
                  eventBus,
                  taskId,
                  contextId,
                  item.id,
                  this.stringifyToolOutput(item.result),
                  false,
                  true
                )
                this.publishToolUpdate(eventBus, taskId, contextId, {
                  request: { callId: item.id, name: 'mcp_tool_call' },
                  status: 'completed',
                  result: item.result,
                  output: item.result,
                })
              }
            }
            break
          }
          case 'web_search': {
            this.publishToolUpdate(eventBus, taskId, contextId, {
              request: { callId: item.id, name: 'web_search' },
              status: 'completed',
              query: item.query,
            })
            break
          }
          case 'todo_list': {
            this.publishToolUpdate(eventBus, taskId, contextId, {
              request: { callId: item.id, name: 'todo_list' },
              status: 'updated',
              items: item.items,
            })
            break
          }
          case 'error': {
            this.publishTextContent(eventBus, taskId, contextId, `Error: ${item.message}`)
            break
          }
          default: {
            if ('content' in item && Array.isArray(item.content)) {
              for (const content of item.content) {
                if (content.type === 'output_text' && content.text) {
                  const contentKey = `${item.id}:${content.type}`
                  const prevLength = sentTextLengths.get(contentKey) || 0
                  const deltaText = content.text.slice(prevLength)
                  if (deltaText.length > 0) {
                    sentTextLengths.set(contentKey, content.text.length)
                    this.publishTextContent(eventBus, taskId, contextId, deltaText)
                  }
                }
              }
            }
          }
        }
      }
    }

    this.publishStatus(eventBus, taskId, contextId, 'completed', true, undefined, 'state-change')
    eventBus.finished()
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    this.canceledTasks.add(taskId)
    const contextId = this.taskContexts.get(taskId)
    this.publishCanceled(eventBus, taskId, contextId)
    eventBus.finished()
  }

  private publishStatus(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    state: TaskStatusUpdateEvent['status']['state'],
    final = false,
    message?: Message,
    codexAgentKind?: string
  ) {
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state,
        message,
        timestamp: new Date().toISOString(),
      },
      final,
      metadata: codexAgentKind ? { codexAgent: { kind: codexAgentKind } } : undefined,
    } satisfies TaskStatusUpdateEvent)
  }

  private publishTextContent(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    text: string
  ) {
    const message: Message = {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      taskId,
      contextId,
      parts: [{ kind: 'text', text }],
    }
    this.publishStatus(eventBus, taskId, contextId, 'working', false, message, 'text-content')
  }

  private publishThought(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    text: string
  ) {
    const message: Message = {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      taskId,
      contextId,
      parts: [{ kind: 'data', data: { text } }],
    }
    this.publishStatus(eventBus, taskId, contextId, 'working', false, message, 'thought')
  }

  private publishToolUpdate(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    data: Record<string, unknown>
  ) {
    const message: Message = {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      taskId,
      contextId,
      parts: [{ kind: 'data', data }],
    }
    this.publishStatus(eventBus, taskId, contextId, 'working', false, message, 'tool-call-update')
  }

  private publishToolOutput(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    callId: string,
    output: string,
    append: boolean,
    lastChunk: boolean
  ) {
    eventBus.publish({
      kind: 'artifact-update',
      taskId,
      contextId,
      artifact: {
        artifactId: `tool-${callId}-output`,
        parts: [{ kind: 'text', text: output }],
      },
      append,
      lastChunk,
    })
  }

  private stringifyToolOutput(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  private publishFailure(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    errorMessage: string
  ) {
    const message: Message = {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      taskId,
      contextId,
      parts: [{ kind: 'text', text: `Error: ${errorMessage}` }],
    }
    this.publishStatus(eventBus, taskId, contextId, 'failed', true, message, 'state-change')
    eventBus.finished()
  }

  private publishCanceled(eventBus: ExecutionEventBus, taskId: string, contextId?: string) {
    const message: Message = {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      taskId,
      contextId: contextId ?? crypto.randomUUID(),
      parts: [{ kind: 'text', text: 'Task canceled.' }],
    }
    this.publishStatus(eventBus, taskId, message.contextId!, 'canceled', true, message, 'state-change')
    this.canceledTasks.delete(taskId)
    this.taskContexts.delete(taskId)
  }
}

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

  private server: http.Server | null = null
  private serverUrl: string | null = null
  private connected = false
  private codex: Codex | null = null
  private requestHandler: DefaultRequestHandler | null = null

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
    this.requestHandler = null
    this.emit('status', { status: 'disconnected' })
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
    if (!this.requestHandler) return
    await this.requestHandler.cancelTask({ id: taskId })
  }

  private async startServer(): Promise<void> {
    this.emit('status', { status: 'connecting' })

    try {
      const { Codex } = await import('@openai/codex-sdk')
      this.codex = new Codex({
        env: {
          ...process.env,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        },
      })

      const port = await this.findAvailablePort(DEFAULT_PORT)
      const app = express()

      app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
        if (req.method === 'OPTIONS') {
          res.status(204).end()
          return
        }
        next()
      })

      const agentCard: AgentCard = {
        name: 'Codex',
        description: 'OpenAI coding agent powered by Codex SDK',
        protocolVersion: '0.3.0',
        version: '0.1.0',
        url: `http://localhost:${port}/a2a/jsonrpc`,
        provider: {
          organization: 'OpenAI',
          url: 'https://openai.com',
        },
        capabilities: {
          streaming: true,
          pushNotifications: false,
          stateTransitionHistory: false,
        },
        supportsAuthenticatedExtendedCard: false,
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        additionalInterfaces: [
          { url: `http://localhost:${port}/a2a/jsonrpc`, transport: 'JSONRPC' },
          { url: `http://localhost:${port}/a2a/rest`, transport: 'HTTP+JSON' },
        ],
        skills: [
          {
            id: 'code_generation',
            name: 'Code Generation',
            description: 'Generate, modify, and explain code',
            tags: ['code', 'programming', 'refactor'],
            examples: ['Refactor this function to be more readable', 'Explain what this code does'],
            inputModes: ['text/plain'],
            outputModes: ['text/plain'],
          },
          {
            id: 'file_operations',
            name: 'File Operations',
            description: 'Create or modify files based on instructions',
            tags: ['files', 'edit', 'patch'],
            examples: ['Update the API client to add retries', 'Create a new config file for the service'],
            inputModes: ['text/plain'],
            outputModes: ['text/plain'],
          },
          {
            id: 'shell_commands',
            name: 'Shell Commands',
            description: 'Run shell commands and report outputs',
            tags: ['shell', 'cli', 'build'],
            examples: ['Run tests and summarize failures', 'Build the project and report errors'],
            inputModes: ['text/plain'],
            outputModes: ['text/plain'],
          },
          {
            id: 'web_search',
            name: 'Web Search',
            description: 'Search the web for relevant technical information',
            tags: ['search', 'web', 'docs'],
            examples: ['Find the latest guidance on a library', 'Look up an error message'],
            inputModes: ['text/plain'],
            outputModes: ['text/plain'],
          },
          {
            id: 'mcp_tooling',
            name: 'MCP Tool Calls',
            description: 'Invoke MCP tools for specialized tasks',
            tags: ['mcp', 'tools', 'integration'],
            examples: ['Use an MCP tool to query internal data', 'Call a custom tool to format code'],
            inputModes: ['text/plain'],
            outputModes: ['text/plain'],
          },
        ],
      }

      const executor = new CodexExecutor(this.codex)
      this.requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor)

      app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: this.requestHandler }))
      app.use(
        '/a2a/jsonrpc',
        jsonRpcHandler({
          requestHandler: this.requestHandler,
          userBuilder: UserBuilder.noAuthentication,
        })
      )
      app.use(
        '/a2a/rest',
        restHandler({
          requestHandler: this.requestHandler,
          userBuilder: UserBuilder.noAuthentication,
        })
      )

      this.server = http.createServer(app)

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
}
