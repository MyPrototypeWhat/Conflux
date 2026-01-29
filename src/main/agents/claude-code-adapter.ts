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
import {
  type Query,
  type SDKAssistantMessage,
  type SDKAuthStatusMessage,
  type SDKMessage,
  type SDKPartialAssistantMessage,
  type SDKResultMessage,
  type SDKToolProgressMessage,
  query,
} from '@anthropic-ai/claude-agent-sdk'
import express from 'express'
import type { A2AMessage, AgentAdapter, AgentCapabilities, AgentEvent } from '../../types/a2a'

const DEFAULT_PORT = 50003

const isTextBlock = (block: unknown): block is { type: 'text'; text: string } => {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: string }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  )
}

const isToolUseBlock = (
  block: unknown
): block is { type: 'tool_use'; id?: string; name: string; input?: unknown } => {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: string }).type === 'tool_use' &&
    typeof (block as { name?: unknown }).name === 'string'
  )
}

const isThinkingBlock = (block: unknown): block is { type: 'thinking'; thinking: string } => {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: string }).type === 'thinking' &&
    typeof (block as { thinking?: unknown }).thinking === 'string'
  )
}

const getStreamEventDelta = (
  event: SDKPartialAssistantMessage['event']
): { type?: string; text?: string; thinking?: string } | null => {
  if (typeof event !== 'object' || !event || !('delta' in event)) return null
  const delta = (event as { delta?: unknown }).delta
  if (typeof delta !== 'object' || !delta) return null
  return delta as { type?: string; text?: string; thinking?: string }
}

class ClaudeCodeExecutor implements AgentExecutor {
  private sessions = new Map<string, { query: Query; abortController: AbortController }>()
  private taskContexts = new Map<string, string>()
  private taskToContext = new Map<string, string>()

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext
    const timestamp = new Date().toISOString()

    this.taskContexts.set(taskId, contextId)
    this.taskToContext.set(taskId, contextId)

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

    const text = userMessage.parts
      .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text')
      .map((part) => part.text)
      .join('\n')

    if (!text) {
      this.publishFailure(eventBus, taskId, contextId, 'No text content')
      return
    }

    const existingSession = this.sessions.get(contextId)
    if (existingSession) {
      existingSession.abortController.abort()
      existingSession.query.close()
      this.sessions.delete(contextId)
    }

    const abortController = new AbortController()
    const cwd = process.cwd()

    const queryInstance = query({
      prompt: text,
      options: {
        cwd,
        abortController,
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
        includePartialMessages: true,
        env: {
          ...process.env,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        },
      },
    })

    this.sessions.set(contextId, { query: queryInstance, abortController })

    let currentTextContent = ''
    const toolUseIdByName = new Map<string, string>()
    // TODO: Emit tool-call-confirmation + input-required when Claude exposes approval-required tools.
    for await (const sdkMessage of queryInstance as AsyncGenerator<SDKMessage, void>) {
      if (!sdkMessage) continue

      switch (sdkMessage.type) {
        case 'assistant': {
          const assistantMsg = sdkMessage as SDKAssistantMessage
          const contentBlocks = Array.isArray(assistantMsg.message.content)
            ? assistantMsg.message.content
            : []

          for (const block of contentBlocks) {
            if (isTextBlock(block)) {
              const newText = block.text.slice(currentTextContent.length)
              if (newText) {
                currentTextContent = block.text
                this.publishTextContent(eventBus, taskId, contextId, newText)
              }
            } else if (isToolUseBlock(block)) {
              const callId = block.id || crypto.randomUUID()
              toolUseIdByName.set(block.name, callId)
              this.publishToolUpdate(eventBus, taskId, contextId, {
                request: { callId, name: block.name },
                status: 'requested',
                input: block.input,
              })
            } else if (isThinkingBlock(block)) {
              this.publishThought(eventBus, taskId, contextId, block.thinking)
            }
          }

          currentTextContent = ''
          break
        }

        case 'stream_event': {
          const streamEvent = sdkMessage as SDKPartialAssistantMessage
          const eventType = (streamEvent.event as { type?: string }).type
          const delta = getStreamEventDelta(streamEvent.event)

          if (eventType === 'content_block_delta' && delta?.type === 'text_delta' && delta.text) {
            this.publishTextContent(eventBus, taskId, contextId, delta.text)
          } else if (
            eventType === 'content_block_delta' &&
            delta?.type === 'thinking_delta' &&
            delta.thinking
          ) {
            this.publishThought(eventBus, taskId, contextId, delta.thinking)
          }
          break
        }

        case 'result': {
          const resultMsg = sdkMessage as SDKResultMessage

          if (resultMsg.subtype === 'success') {
            this.publishTextContent(eventBus, taskId, contextId, resultMsg.result)
          } else if (resultMsg.subtype.startsWith('error') && resultMsg.errors.length) {
            this.publishFailure(eventBus, taskId, contextId, resultMsg.errors.join('\n'))
            return
          }
          break
        }

        case 'auth_status': {
          const authMsg = sdkMessage as SDKAuthStatusMessage
          if (authMsg.error) {
            this.publishFailure(
              eventBus,
              taskId,
              contextId,
              `Authentication error: ${authMsg.error}`
            )
            return
          }
          break
        }

        case 'tool_progress': {
          const progressMsg = sdkMessage as SDKToolProgressMessage
          const callId = progressMsg.tool_use_id
          toolUseIdByName.set(progressMsg.tool_name, callId)
          this.publishToolUpdate(eventBus, taskId, contextId, {
            request: { callId, name: progressMsg.tool_name },
            status: 'in_progress',
            elapsedSeconds: progressMsg.elapsed_time_seconds,
          })
          break
        }

        default:
          break
      }
    }

    this.sessions.delete(contextId)
    this.taskContexts.delete(taskId)
    this.publishStatus(eventBus, taskId, contextId, 'completed', true, undefined, 'state-change')
    eventBus.finished()
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    const contextId = this.taskToContext.get(taskId)
    if (contextId) {
      const session = this.sessions.get(contextId)
      if (session) {
        session.abortController.abort()
        session.query.close()
        this.sessions.delete(contextId)
      }
    }

    const message: Message = {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      taskId,
      contextId: contextId ?? crypto.randomUUID(),
      parts: [{ kind: 'text', text: 'Task canceled.' }],
    }
    this.publishStatus(
      eventBus,
      taskId,
      message.contextId!,
      'canceled',
      true,
      message,
      'state-change'
    )
    eventBus.finished()
  }

  private publishStatus(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    state: TaskStatusUpdateEvent['status']['state'],
    final = false,
    message?: Message,
    claudeAgentKind?: string
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
      metadata: claudeAgentKind ? { claudeAgent: { kind: claudeAgentKind } } : undefined,
    } satisfies TaskStatusUpdateEvent)
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
}

/**
 * ClaudeCodeAdapter - A2A adapter for Claude Code
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
        name: 'Claude Code',
        description: "Anthropic's coding agent powered by Claude Agent SDK",
        protocolVersion: '0.3.0',
        version: '0.1.0',
        url: `http://localhost:${port}/a2a/jsonrpc`,
        provider: {
          organization: 'Anthropic',
          url: 'https://anthropic.com',
        },
        capabilities: {
          streaming: true,
          pushNotifications: false,
          stateTransitionHistory: true,
        },
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        additionalInterfaces: [
          { url: `http://localhost:${port}/a2a/jsonrpc`, transport: 'JSONRPC' },
          { url: `http://localhost:${port}/a2a/rest`, transport: 'HTTP+JSON' },
        ],
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

      const executor = new ClaudeCodeExecutor()
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
}
