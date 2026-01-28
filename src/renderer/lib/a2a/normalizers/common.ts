import type { Message, Part, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk'
import type { A2AEventNormalizer, NormalizedBlock } from '@/lib/a2a/normalizers/types'

const mapItemTypeToBlock = (itemType?: string) => {
  switch (itemType) {
    case 'reasoning':
      return { blockType: 'reasoning' as const }
    case 'tool_call':
    case 'mcp_tool_call':
    case 'mcp_tool_result':
    case 'mcp_tool_error':
      return { blockType: 'tool_call' as const }
    case 'file_change':
      return { blockType: 'file_change' as const }
    case 'command_execution':
      return { blockType: 'command_execution' as const }
    case 'command_output':
    case 'command_status':
      return { blockType: 'command_execution' as const, appendToCommand: true }
    case 'web_search':
      return { blockType: 'web_search' as const }
    case 'todo_list':
      return { blockType: 'todo_list' as const }
    case 'error':
      return { blockType: 'error' as const }
    default:
      return { blockType: 'text' as const }
  }
}

const normalizeDataPayload = (data: Record<string, unknown>) => {
  const itemType = typeof data.itemType === 'string' ? data.itemType : undefined
  const metadata =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : undefined
  const text = typeof data.text === 'string' ? data.text : JSON.stringify(data, null, 2)
  return { itemType, metadata, text }
}

export const normalizePart = (part: Part): NormalizedBlock | null => {
  if (part.kind === 'text') {
    const itemType = typeof part.metadata?.itemType === 'string' ? part.metadata.itemType : undefined
    const mapped = mapItemTypeToBlock(itemType)
    return {
      blockType: mapped.blockType,
      text: part.text ?? '',
      metadata: part.metadata as Record<string, unknown> | undefined,
      appendToCommand: mapped.appendToCommand,
    }
  }

  if (part.kind === 'data') {
    const payload = normalizeDataPayload(part.data as Record<string, unknown>)
    const mapped = mapItemTypeToBlock(payload.itemType)
    return {
      blockType: mapped.blockType,
      text: payload.text,
      metadata: payload.metadata,
      appendToCommand: mapped.appendToCommand,
    }
  }

  return null
}

export const normalizeParts = (parts: Part[]) =>
  parts.map((part) => normalizePart(part)).filter(Boolean) as NormalizedBlock[]

export const createCommonNormalizer = (): A2AEventNormalizer => {
  return {
    handleStatusUpdate: (event: TaskStatusUpdateEvent) => {
      const message = event.status.message as Message | undefined
      if (!message?.parts) return []
      return normalizeParts(message.parts)
    },
    handleArtifactUpdate: (event: TaskArtifactUpdateEvent) => {
      return [
        {
          blockType: 'artifact',
          artifact: event.artifact,
          append: event.append,
        },
      ]
    },
    handleMessage: (event: Message) => {
      if (!event.parts) return []
      return normalizeParts(event.parts)
    },
    normalizePart,
  }
}
