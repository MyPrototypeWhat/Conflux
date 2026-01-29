import type { Message, Part, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk'
import type { MessageBlockType } from '@/lib/a2a/blocks'

export type NormalizedBlock =
  | {
      blockType: Exclude<MessageBlockType, 'artifact'>
      text: string
      metadata?: Record<string, unknown>
      appendToCommand?: boolean
    }
  | {
      blockType: 'artifact'
      artifact: TaskArtifactUpdateEvent['artifact']
      append?: boolean
    }

export type A2AEventNormalizer = {
  handleStatusUpdate: (event: TaskStatusUpdateEvent) => NormalizedBlock[]
  handleArtifactUpdate: (event: TaskArtifactUpdateEvent) => NormalizedBlock[]
  handleMessage: (event: Message) => NormalizedBlock[]
  normalizePart: (part: Part) => NormalizedBlock | null
}
