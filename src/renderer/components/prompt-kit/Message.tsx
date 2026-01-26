import { cva } from 'class-variance-authority'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, MessageBlock, MessageBlockType } from '@/hooks/useChat'
import { cn } from '@/lib/utils'

const messageVariants = cva('flex gap-3 text-sm', {
  variants: {
    role: {
      user: 'justify-end',
      assistant: 'justify-start',
    },
  },
  defaultVariants: {
    role: 'assistant',
  },
})

const blockVariants = cva('rounded-lg px-3 py-2', {
  variants: {
    type: {
      text: 'bg-muted text-foreground',
      reasoning: 'bg-amber-500/10 border border-amber-500/20 text-muted-foreground',
      tool_call: 'bg-blue-500/10 border border-blue-500/20 font-mono text-xs',
      file_change: 'bg-green-500/10 border border-green-500/20',
    },
  },
  defaultVariants: {
    type: 'text',
  },
})

interface MessageProps {
  message: ChatMessage
  avatar?: React.ReactNode
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded bg-background/50 p-2 text-xs">{children}</pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className
          return isInline ? (
            <code className="rounded bg-background/50 px-1 py-0.5 text-xs">{children}</code>
          ) : (
            <code className={className}>{children}</code>
          )
        },
        ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function ReasoningBlock({ block }: { block: MessageBlock }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className={cn(blockVariants({ type: 'reasoning' }), 'w-full')}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-amber-600 dark:text-amber-400"
      >
        <span className={cn('transition-transform', isExpanded && 'rotate-90')}>▶</span>
        <span>{block.isStreaming ? 'Thinking...' : 'Thought'}</span>
        {block.isStreaming && <span className="ml-1 inline-block animate-pulse">▊</span>}
      </button>
      {isExpanded && (
        <div className="mt-2 text-xs opacity-80">
          <MarkdownContent>{block.content}</MarkdownContent>
        </div>
      )}
    </div>
  )
}

function TextBlock({ block }: { block: MessageBlock }) {
  return (
    <div className={blockVariants({ type: 'text' })}>
      <MarkdownContent>{block.content}</MarkdownContent>
      {block.isStreaming && <span className="ml-1 inline-block animate-pulse">▊</span>}
    </div>
  )
}

function ToolCallBlock({ block }: { block: MessageBlock }) {
  return (
    <div className={blockVariants({ type: 'tool_call' })}>
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <span>⚙️</span>
        <span>Tool Call</span>
        {block.isStreaming && <span className="ml-1 inline-block animate-pulse">▊</span>}
      </div>
      <pre className="mt-1 whitespace-pre-wrap text-xs">{block.content}</pre>
    </div>
  )
}

function FileChangeBlock({ block }: { block: MessageBlock }) {
  return (
    <div className={blockVariants({ type: 'file_change' })}>
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <span>📄</span>
        <span>File Change</span>
        {block.isStreaming && <span className="ml-1 inline-block animate-pulse">▊</span>}
      </div>
      <pre className="mt-1 whitespace-pre-wrap text-xs">{block.content}</pre>
    </div>
  )
}

function BlockRenderer({ block }: { block: MessageBlock }) {
  switch (block.type) {
    case 'reasoning':
      return <ReasoningBlock block={block} />
    case 'tool_call':
      return <ToolCallBlock block={block} />
    case 'file_change':
      return <FileChangeBlock block={block} />
    default:
      return <TextBlock block={block} />
  }
}

function Message({ message, avatar }: MessageProps) {
  const { role, content, blocks, isStreaming } = message

  // User message - simple bubble
  if (role === 'user') {
    return (
      <div className={messageVariants({ role: 'user' })}>
        <div className="rounded-lg bg-primary px-3 py-2 text-primary-foreground max-w-[80%]">
          <MarkdownContent>{content}</MarkdownContent>
        </div>
      </div>
    )
  }

  // Assistant message - render blocks
  return (
    <div className={messageVariants({ role: 'assistant' })}>
      {avatar && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
          {avatar}
        </div>
      )}
      <div className="flex max-w-[80%] flex-col gap-2">
        {blocks.length === 0 && isStreaming ? (
          // Empty streaming state - show loading indicator
          <div className={blockVariants({ type: 'text' })}>
            <span className="inline-block animate-pulse">▊</span>
          </div>
        ) : (
          blocks.map((block) => <BlockRenderer key={block.id} block={block} />)
        )}
      </div>
    </div>
  )
}

export { Message, messageVariants, blockVariants }
export type { MessageBlockType }
