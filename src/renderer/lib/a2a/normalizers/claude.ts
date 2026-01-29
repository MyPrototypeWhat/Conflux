import type { Part, TaskStatusUpdateEvent, Message } from '@a2a-js/sdk'
import type { NormalizedBlock } from '@/lib/a2a/normalizers/types'
import { createCommonNormalizer, normalizePart } from '@/lib/a2a/normalizers/common'

type ClaudeToolData = {
  request?: { name?: string; callId?: string }
  status?: string
  input?: unknown
  output?: unknown
  error?: unknown
  elapsedSeconds?: number
  text?: string
  description?: string
}

const mapToolNameToBlockType = (toolName: string): NormalizedBlock['blockType'] => {
  const normalized = toolName.toLowerCase()
  if (normalized === 'bash' || normalized === 'shell' || normalized === 'command') {
    return 'command_execution'
  }
  if (normalized.includes('search') || normalized.includes('web')) return 'web_search'
  if (['write', 'edit', 'replace', 'apply_patch'].includes(normalized)) return 'file_change'
  if (normalized.includes('todo')) return 'todo_list'
  return 'tool_call'
}

const extractClaudeKind = (event: TaskStatusUpdateEvent) => {
  const metadata = event.metadata as { claudeAgent?: { kind?: string } } | undefined
  return metadata?.claudeAgent?.kind
}

const normalizeToolCallData = (data: ClaudeToolData): NormalizedBlock | null => {
  const toolName = data.request?.name || 'tool'
  const blockType = mapToolNameToBlockType(toolName)
  const summary = data.status ? `${toolName} (${data.status})` : toolName
  const metadata: Record<string, unknown> = {
    toolName,
    status: data.status,
    callId: data.request?.callId,
    input: data.input,
    output: data.output,
    error: data.error,
    elapsedSeconds: data.elapsedSeconds,
  }

  if (blockType === 'command_execution') {
    metadata.command = toolName
  }

  return {
    blockType,
    text: blockType === 'tool_call' ? summary : '',
    metadata,
    appendToCommand: false,
  }
}

const normalizeThoughtData = (data: ClaudeToolData): NormalizedBlock | null => {
  const text = data.text || data.description
  if (!text) return null
  return { blockType: 'reasoning', text }
}

export const createClaudeNormalizer = () => {
  const common = createCommonNormalizer()

  return {
    ...common,
    handleStatusUpdate: (event: TaskStatusUpdateEvent) => {
      const message = event.status.message as Message | undefined
      if (!message?.parts) return []

      const normalized: NormalizedBlock[] = []
      const claudeKind = extractClaudeKind(event)

      for (const part of message.parts) {
        if (part.kind === 'data' && part.data && typeof part.data === 'object') {
          const data = part.data as ClaudeToolData
          if (claudeKind === 'tool-call-update' || claudeKind === 'tool-call-confirmation') {
            const block = normalizeToolCallData(data)
            if (block) {
              normalized.push(block)
              continue
            }
          }

          if (claudeKind === 'thought') {
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
  }
}
