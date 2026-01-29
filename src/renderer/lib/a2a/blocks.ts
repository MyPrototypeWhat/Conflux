import type { Part } from '@a2a-js/sdk'

export type MessageBlockType =
  | 'text'
  | 'reasoning'
  | 'tool_call'
  | 'file_change'
  | 'command_execution'
  | 'web_search'
  | 'todo_list'
  | 'error'
  | 'artifact'

export interface MessageBlock {
  id: string
  type: MessageBlockType
  content: string
  isStreaming?: boolean
  metadata?: {
    callId?: string
    toolName?: string
    input?: unknown
    output?: unknown
    error?: unknown
    server?: string
    tool?: string
    arguments?: unknown
    result?: unknown
    command?: string
    exitCode?: number
    status?: string
    query?: string
    items?: Array<{ text: string; completed: boolean }>
    changes?: Array<{ path: string; kind: string }>
    artifact?: {
      artifactId: string
      name?: string
      parts: Part[]
    }
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks: MessageBlock[]
  timestamp: number
  isStreaming?: boolean
}
