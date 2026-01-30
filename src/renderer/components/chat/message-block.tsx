import { Attachment } from '@/renderer/components/ui/attachment'
import { MessageContent } from '@/renderer/components/ui/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/renderer/components/ui/reasoning'
import { Tool, type ToolPart } from '@/renderer/components/ui/tool'
import type { MessageBlock } from '@/renderer/hooks/useChat'

export type MessageBlockViewProps = {
  block: MessageBlock
}

function blockToToolPart(block: MessageBlock): ToolPart | null {
  const getState = (): ToolPart['state'] => {
    if (block.isStreaming) return 'input-streaming'
    if (
      block.metadata?.status === 'error' ||
      (block.metadata?.exitCode && block.metadata?.exitCode !== 0)
    )
      return 'output-error'
    return 'output-available'
  }

  const mapStatusState = (status?: string): ToolPart['state'] => {
    if (!status) return block.isStreaming ? 'input-streaming' : 'input-available'
    const normalized = status.toLowerCase()
    if (['requested', 'in_progress', 'running', 'started'].includes(normalized))
      return 'input-streaming'
    if (['completed', 'succeeded', 'success'].includes(normalized)) return 'output-available'
    if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'output-error'
    return 'input-available'
  }

  switch (block.type) {
    case 'command_execution':
      return {
        type: 'Shell',
        state: getState(),
        input: block.metadata?.command ? { command: block.metadata.command } : undefined,
        output: block.content ? { output: block.content } : undefined,
        errorText:
          block.metadata?.exitCode && block.metadata?.exitCode !== 0
            ? `Exit code: ${block.metadata?.exitCode}`
            : undefined,
      }
    case 'todo_list':
      return {
        type: 'TodoWrite',
        state: getState(),
        output: block.metadata?.items ? { items: block.metadata.items } : undefined,
      }
    case 'file_change':
      return {
        type: 'FileEdit',
        state: getState(),
        output: block.metadata?.changes ? { changes: block.metadata.changes } : undefined,
      }
    case 'web_search':
      return {
        type: 'WebSearch',
        state: getState(),
        input: block.metadata?.query ? { query: block.metadata.query } : undefined,
      }
    case 'tool_call': {
      const input =
        block.metadata?.input ??
        (block.metadata?.arguments !== undefined ? block.metadata.arguments : undefined)
      const output =
        block.metadata?.output ??
        (block.metadata?.result !== undefined ? block.metadata.result : undefined)

      const errorText = block.metadata?.error
        ? typeof block.metadata.error === 'string'
          ? block.metadata.error
          : JSON.stringify(block.metadata.error)
        : undefined

      return {
        type: block.metadata?.toolName || block.metadata?.tool || 'Tool',
        state: mapStatusState(block.metadata?.status),
        input: input !== undefined ? { input } : undefined,
        output: output !== undefined ? { output } : undefined,
        toolCallId: block.metadata?.callId,
        errorText,
      }
    }
    default:
      return null
  }
}

function MessageBlockView({ block }: MessageBlockViewProps) {
  // Try to render as tool first
  const toolPart = blockToToolPart(block)
  if (toolPart) {
    return <Tool toolPart={toolPart} />
  }

  switch (block.type) {
    case 'artifact': {
      if (!block.metadata?.artifact) {
        return null
      }
      return <Attachment artifact={block.metadata.artifact} />
    }
    case 'reasoning': {
      return (
        <Reasoning isStreaming={block.isStreaming}>
          <ReasoningTrigger className="text-sm">Reasoning</ReasoningTrigger>
          <ReasoningContent markdown>{block.content}</ReasoningContent>
        </Reasoning>
      )
    }
    case 'error': {
      return <MessageContent className=" text-red-600">{block.content}</MessageContent>
    }
    default: {
      return <MessageContent markdown>{block.content}</MessageContent>
    }
  }
}

export { MessageBlockView }
