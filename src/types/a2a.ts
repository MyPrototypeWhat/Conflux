/**
 * A2A Protocol Types
 * Based on: https://a2a-protocol.org/latest/
 */

// Message Parts
export interface TextPart {
  kind: 'text'
  text: string
}

export interface FilePart {
  kind: 'file'
  file: {
    mimeType: string
    data: string // base64 encoded
    name?: string
  }
}

export interface DataPart {
  kind: 'data'
  data: Record<string, unknown>
}

export type MessagePart = TextPart | FilePart | DataPart

// A2A Message
export interface A2AMessage {
  role: 'user' | 'agent'
  parts: MessagePart[]
  messageId?: string
  timestamp?: string
}

// Task Status
export type TaskStatus = 'submitted' | 'working' | 'completed' | 'failed' | 'canceled'

// A2A Task
export interface A2ATask {
  id: string
  contextId: string
  status: TaskStatus
  history: A2AMessage[]
  artifacts?: A2AArtifact[]
}

// Artifact (file output from agent)
export interface A2AArtifact {
  name: string
  mimeType: string
  data: string
}

// Agent Events (for streaming)
export type AgentEventType =
  | 'status'
  | 'text_delta'
  | 'artifact'
  | 'message_complete'
  | 'task_complete'
  | 'error'

export interface AgentEvent {
  type: AgentEventType
  taskId?: string
  // For text_delta
  text?: string
  // For status
  status?: TaskStatus
  // For artifact
  artifact?: A2AArtifact
  // For message_complete
  message?: A2AMessage
  // For error
  error?: {
    code: string
    message: string
  }
}

// Agent Capabilities
export interface AgentCapabilities {
  streaming: boolean
  pushNotifications: boolean
  stateTransitionHistory: boolean
  tools?: string[]
}

// Unified Agent Adapter Interface
export interface AgentAdapter {
  readonly id: string
  readonly name: string
  readonly capabilities: AgentCapabilities

  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  sendMessage(message: A2AMessage, contextId?: string): AsyncGenerator<AgentEvent, void, unknown>

  cancelTask(taskId: string): Promise<void>
}

// Chat Message (simplified for UI)
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status?: 'pending' | 'streaming' | 'complete' | 'error'
}

// IPC Event Types
export interface SendMessageRequest {
  agentId: string
  content: string
  contextId?: string
}

export interface AgentStatusUpdate {
  agentId: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
}
