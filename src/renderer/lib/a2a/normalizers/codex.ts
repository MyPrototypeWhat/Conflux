import type { Message, Part, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk'
import { createCommonNormalizer, normalizePart } from '@/lib/a2a/normalizers/common'
import type { NormalizedBlock } from '@/lib/a2a/normalizers/types'

type CodexToolData = {
  request?: { name?: string; callId?: string }
  status?: string
  command?: string
  exitCode?: number
  changes?: Array<{ path: string; kind: string }>
  query?: string
  items?: Array<{ text: string; completed: boolean }>
  server?: string
  tool?: string
  arguments?: unknown
  result?: unknown
  error?: unknown
  text?: string
  description?: string
}

const mapToolNameToBlockType = (toolName: string): NormalizedBlock['blockType'] => {
  const normalized = toolName.toLowerCase()
  if (normalized === 'command_execution') return 'command_execution'
  if (normalized === 'file_change') return 'file_change'
  if (normalized === 'web_search') return 'web_search'
  if (normalized === 'todo_list') return 'todo_list'
  if (normalized === 'mcp_tool_call') return 'tool_call'
  return 'tool_call'
}

const extractCodexKind = (event: TaskStatusUpdateEvent) => {
  const metadata = event.metadata as { codexAgent?: { kind?: string } } | undefined
  return metadata?.codexAgent?.kind
}

type ToolInfo = { toolName: string; blockType: NormalizedBlock['blockType'] }

const normalizeToolCallData = (
  data: CodexToolData,
  toolCallsById: Map<string, ToolInfo>
): NormalizedBlock | null => {
  const toolName = data.request?.name || 'tool'
  const blockType = mapToolNameToBlockType(toolName)
  const callId = data.request?.callId
  const summary = data.status ? `${toolName} (${data.status})` : toolName

  if (callId) {
    toolCallsById.set(callId, { toolName, blockType })
  }

  if (blockType === 'command_execution') {
    return {
      blockType,
      text: '',
      metadata: {
        command: data.command || toolName,
        status: data.status,
        exitCode: data.exitCode,
        callId,
      },
      appendToCommand: false,
    }
  }

  if (blockType === 'file_change') {
    return {
      blockType,
      text: '',
      metadata: {
        changes: data.changes,
        status: data.status,
        callId,
      },
    }
  }

  if (blockType === 'web_search') {
    return {
      blockType,
      text: '',
      metadata: {
        query: data.query,
        status: data.status,
        callId,
      },
    }
  }

  if (blockType === 'todo_list') {
    return {
      blockType,
      text: '',
      metadata: {
        items: data.items,
        status: data.status,
        callId,
      },
    }
  }

  return {
    blockType: 'tool_call',
    text: summary,
    metadata: {
      status: data.status,
      callId,
      toolName: data.server && data.tool ? `${data.server}/${data.tool}` : toolName,
      server: data.server,
      tool: data.tool,
      arguments: data.arguments,
      result: data.result,
      input: data.arguments,
      output: data.result,
      error: data.error,
    },
  }
}

const normalizeThoughtData = (data: CodexToolData): NormalizedBlock | null => {
  const text = data.text || data.description
  if (!text) return null
  return { blockType: 'reasoning', text }
}

export const createCodexNormalizer = () => {
  const common = createCommonNormalizer()
  const toolCallsById = new Map<string, ToolInfo>()

  return {
    ...common,
    handleStatusUpdate: (event: TaskStatusUpdateEvent) => {
      const message = event.status.message as Message | undefined
      if (!message?.parts) return []

      const codexKind = extractCodexKind(event)
      const normalized: NormalizedBlock[] = []

      for (const part of message.parts) {
        if (part.kind === 'data' && part.data && typeof part.data === 'object') {
          const data = part.data as CodexToolData
          if (codexKind === 'tool-call-update' || codexKind === 'tool-call-confirmation') {
            const block = normalizeToolCallData(data, toolCallsById)
            if (block) {
              normalized.push(block)
              continue
            }
          }

          if (codexKind === 'thought') {
            const thought = normalizeThoughtData(data)
            if (thought) {
              normalized.push(thought)
              continue
            }
          }
        }

        const fallback = normalizePart(part as Part)
        if (fallback) normalized.push(fallback)
      }

      return normalized
    },
    handleArtifactUpdate: (event: TaskArtifactUpdateEvent) => {
      const artifactId = event.artifact.artifactId
      const toolOutputMatch = artifactId.match(/^tool-(.+)-output$/)
      const textParts = event.artifact.parts
        .filter((part): part is Extract<Part, { kind: 'text' }> => part.kind === 'text')
        .map((part) => part.text)
        .join('')

      if (toolOutputMatch && textParts) {
        const callId = toolOutputMatch[1]
        const toolInfo = toolCallsById.get(callId)
        if (toolInfo && toolInfo.blockType === 'command_execution') {
          return [
            {
              blockType: 'command_execution',
              text: textParts,
              metadata: { command: toolInfo.toolName, callId },
              appendToCommand: true,
            },
          ]
        }
      }

      return common.handleArtifactUpdate(event)
    },
  }
}
