import { cva } from 'class-variance-authority'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
      command_execution: 'bg-zinc-900 border border-zinc-700/50',
      web_search: 'bg-purple-500/10 border border-purple-500/20',
      todo_list: 'bg-cyan-500/10 border border-cyan-500/20',
      error: 'bg-red-500/10 border border-red-500/20',
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
  return (
    <div className={cn(blockVariants({ type: 'reasoning' }), 'w-full')}>
      <Accordion>
        <AccordionItem value="reasoning" className="border-none">
          <AccordionTrigger className="py-0 hover:no-underline">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              <span>{block.isStreaming ? 'Thinking...' : 'Thought'}</span>
              {block.isStreaming && <span className="inline-block animate-pulse">▊</span>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="mt-2 text-xs opacity-80">
              <MarkdownContent>{block.content}</MarkdownContent>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
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

function CommandBlock({ block }: { block: MessageBlock }) {
  const command = block.metadata?.command || 'Command'
  const status = block.metadata?.status
  const exitCode = block.metadata?.exitCode
  const output = block.content

  // Status badge
  const getStatusBadge = () => {
    if (block.isStreaming) {
      return (
        <Badge variant="outline" className="ml-2 gap-1 border-amber-500/50 text-amber-500">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-400" />
          running
        </Badge>
      )
    }
    if (status === 'completed' && (exitCode === 0 || exitCode === undefined)) {
      return (
        <Badge variant="outline" className="ml-2 border-emerald-500/50 text-emerald-500">
          ✓ exit 0
        </Badge>
      )
    }
    if (status === 'completed' || status === 'failed') {
      return (
        <Badge variant="destructive" className="ml-2">
          ✗ exit {exitCode ?? 1}
        </Badge>
      )
    }
    return null
  }

  return (
    <div
      className={cn(
        blockVariants({ type: 'command_execution' }),
        'w-full overflow-hidden font-mono'
      )}
    >
      <Accordion defaultValue={['command']}>
        <AccordionItem value="command" className="border-none">
          <AccordionTrigger className="py-0 hover:no-underline">
            <div className="flex flex-1 items-center gap-2">
              <span className="text-emerald-500">$</span>
              <span className="flex-1 truncate text-left text-sm text-zinc-100">{command}</span>
              {getStatusBadge()}
            </div>
          </AccordionTrigger>
          {output && (
            <AccordionContent className="pb-0">
              <div className="mt-2 max-h-72 overflow-auto rounded border border-zinc-800 bg-black/40 p-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                  {output}
                </pre>
              </div>
            </AccordionContent>
          )}
        </AccordionItem>
      </Accordion>
    </div>
  )
}

function WebSearchBlock({ block }: { block: MessageBlock }) {
  const query = block.metadata?.query || ''

  return (
    <div className={blockVariants({ type: 'web_search' })}>
      <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
        <span>🔍</span>
        <span>Web Search</span>
        {block.isStreaming && <span className="ml-1 inline-block animate-pulse">▊</span>}
      </div>
      {query && <p className="mt-1 text-xs italic text-muted-foreground">"{query}"</p>}
    </div>
  )
}

function TodoListBlock({ block }: { block: MessageBlock }) {
  const items = block.metadata?.items || []

  return (
    <div className={blockVariants({ type: 'todo_list' })}>
      <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
        <span>📋</span>
        <span>Todo List</span>
        {block.isStreaming && <span className="ml-1 inline-block animate-pulse">▊</span>}
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span>{item.completed ? '☑' : '☐'}</span>
              <span className={item.completed ? 'text-muted-foreground line-through' : ''}>
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ErrorBlock({ block }: { block: MessageBlock }) {
  return (
    <Alert variant="destructive" className="rounded-lg">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{block.content}</AlertDescription>
    </Alert>
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
    case 'command_execution':
      return <CommandBlock block={block} />
    case 'web_search':
      return <WebSearchBlock block={block} />
    case 'todo_list':
      return <TodoListBlock block={block} />
    case 'error':
      return <ErrorBlock block={block} />
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
