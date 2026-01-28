import type { Message, Part, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk'
import { createCommonNormalizer, normalizePart } from '@/lib/a2a/normalizers/common'
import type { NormalizedBlock } from '@/lib/a2a/normalizers/types'

type ToolInfo = {
  toolName: string
  blockType: NormalizedBlock['blockType']
}

const mapToolNameToBlockType = (toolName: string): NormalizedBlock['blockType'] => {
  const normalized = toolName.toLowerCase()
  if (['bash', 'shell', 'exec', 'command', 'run'].includes(normalized)) return 'command_execution'
  if (normalized.includes('search')) return 'web_search'
  if (normalized.includes('todo')) return 'todo_list'
  if (['write', 'edit', 'replace', 'create_file', 'apply_patch'].includes(normalized))
    return 'file_change'
  return 'tool_call'
}

const extractAdapterKind = (event: TaskStatusUpdateEvent) => {
  const metadata = event.metadata as { coderAgent?: { kind?: string } } | undefined
  return metadata?.coderAgent?.kind
}

const normalizeToolCallData = (
  data: Record<string, unknown>,
  toolCallsById: Map<string, ToolInfo>,
  coderAgentKind?: string
): NormalizedBlock | null => {
  const request = data.request as { name?: string; callId?: string } | undefined
  const toolName = request?.name || 'tool'
  const status = typeof data.status === 'string' ? data.status : undefined
  const summary = status ? `${toolName} (${status})` : toolName
  const blockType = mapToolNameToBlockType(toolName)

  if (request?.callId) {
    toolCallsById.set(request.callId, { toolName, blockType })
  }

  const metadata: Record<string, unknown> = { toolName, status, callId: request?.callId }
  if (blockType === 'command_execution') {
    metadata.command = toolName
  }

  return {
    blockType,
    text: summary,
    metadata,
    appendToCommand: false,
  }
}

const normalizeThoughtData = (data: Record<string, unknown>): NormalizedBlock | null => {
  const subject = typeof data.subject === 'string' ? data.subject : undefined
  const description = typeof data.description === 'string' ? data.description : undefined
  const thoughtText = [subject, description].filter(Boolean).join('\n')
  if (!thoughtText) return null
  return {
    blockType: 'reasoning',
    text: thoughtText,
  }
}

export const createGeminiNormalizer = () => {
  const common = createCommonNormalizer()
  const toolCallsById = new Map<string, ToolInfo>()

  return {
    ...common,
    handleStatusUpdate: (event: TaskStatusUpdateEvent) => {
      const message = event.status.message as Message | undefined
      if (!message?.parts) return []

      const coderAgentKind = extractAdapterKind(event)
      const normalized: NormalizedBlock[] = []

      for (const part of message.parts) {
        if (part.kind === 'data') {
          const data = part.data as Record<string, unknown>
          if (
            coderAgentKind === 'tool-call-update' ||
            coderAgentKind === 'tool-call-confirmation'
          ) {
            const toolBlock = normalizeToolCallData(data, toolCallsById, coderAgentKind)
            if (toolBlock) normalized.push(toolBlock)
            continue
          }

          if (coderAgentKind === 'thought') {
            const thoughtBlock = normalizeThoughtData(data)
            if (thoughtBlock) {
              normalized.push(thoughtBlock)
              continue
            }
          }
        }

        const fallback = normalizePart(part)
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
        if (toolInfo) {
          if (toolInfo.blockType === 'command_execution') {
            return [
              {
                blockType: 'command_execution',
                text: textParts,
                metadata: { command: toolInfo.toolName, callId },
                appendToCommand: true,
              },
            ]
          }

          return [
            {
              blockType: 'tool_call',
              text: textParts,
              metadata: { toolName: toolInfo.toolName, callId },
            },
          ]
        }
      }

      return common.handleArtifactUpdate(event)
    },
  }
}
