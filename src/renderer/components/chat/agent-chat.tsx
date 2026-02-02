import { Loader2, PanelRightClose, PanelRightOpen, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MessageBlockView } from '@/renderer/components/chat/message-block'
import { RightPanel } from '@/renderer/components/panel/right-panel'
import { Button } from '@/renderer/components/ui/button'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/renderer/components/ui/chat-container'
import { Message, MessageContent } from '@/renderer/components/ui/message'
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from '@/renderer/components/ui/prompt-input'
import { type ChatMessage, type MessageBlock, useChat } from '@/renderer/hooks/useChat'
import { cn } from '@/renderer/lib/utils'

export type AgentChatProps = {
  agentId: string
  name: string
  icon: React.ComponentType<{ size?: number }>
}

function AgentChat({ agentId, name, icon: Icon }: AgentChatProps) {
  const [input, setInput] = useState('')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(420)
  const [isResizing, setIsResizing] = useState(false)
  const [projectPath, setProjectPath] = useState<string | undefined>()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const {
    messages,
    isLoading,
    isConnected,
    isConnecting,
    connectionError,
    sendMessage,
    tryAutoConnect,
  } = useChat(agentId)

  useEffect(() => {
    tryAutoConnect()
  }, [tryAutoConnect])

  // Load projectPath from Tab metadata
  useEffect(() => {
    window.agentAPI.getActiveTab().then((tab) => {
      if (tab?.metadata?.projectPath) {
        setProjectPath(tab.metadata.projectPath)
      }
    })
  }, [])

  const handleSubmit = () => {
    if (!input.trim() || isLoading || !isConnected) return
    sendMessage(input)
    setInput('')
  }

  useEffect(() => {
    if (!isResizing) return
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const handleMove = (event: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const nextWidth = Math.max(280, Math.min(680, rect.right - event.clientX))
      setPanelWidth(nextWidth)
    }
    const handleUp = () => setIsResizing(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isResizing])

  return (
    <div ref={containerRef} className="relative flex h-screen bg-background text-foreground">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded bg-primary/10">
              <Icon size={20} />
            </div>
            <div>
              <h1 className="text-sm font-medium">{name}</h1>
              <p className="text-xs text-muted-foreground">via A2A Protocol</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnecting && <span className="text-xs text-muted-foreground">Connecting...</span>}
            {isConnected && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="size-2 rounded-full bg-green-500" />
                Connected
              </span>
            )}
            {connectionError && <span className="text-xs text-red-500">{connectionError}</span>}
          </div>
        </div>

        {/* Chat Area */}
        <ChatContainerRoot className="flex-1">
          <ChatContainerContent className="flex flex-col gap-4 px-4 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                  <Icon size={32} />
                </div>
                <div className="text-center">
                  <h2 className="text-lg font-medium">{name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start a conversation with {name}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg: ChatMessage) => {
                const isUser = msg.role === 'user'
                const assistantBlocks =
                  msg.blocks.length > 0
                    ? msg.blocks
                    : msg.content
                      ? [
                          {
                            id: msg.id,
                            type: 'text',
                            content: msg.content,
                            isStreaming: msg.isStreaming,
                          } as MessageBlock,
                        ]
                      : []

                return (
                  <Message key={msg.id} className={cn('items-start', isUser && 'flex-row-reverse')}>
                    <div
                      className={cn(
                        'flex w-full flex-col gap-2',
                        isUser ? 'items-end' : 'items-start'
                      )}
                    >
                      {!isUser && <Icon size={16} />}
                      {isUser ? (
                        <MessageContent className="bg-primary text-primary-foreground">
                          {msg.content}
                        </MessageContent>
                      ) : assistantBlocks.length === 0 ? (
                        <MessageContent className="text-muted-foreground">
                          {msg.isStreaming ? '...' : ''}
                        </MessageContent>
                      ) : (
                        assistantBlocks.map((block) => (
                          <MessageBlockView key={block.id} block={block} />
                        ))
                      )}
                    </div>
                  </Message>
                )
              })
            )}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
        </ChatContainerRoot>

        {/* Input */}
        <div className="px-4 pb-4">
          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={!isConnected}
          >
            <div className="flex items-end gap-2">
              <PromptInputTextarea
                placeholder={isConnected ? `Ask ${name} anything...` : `Connecting to ${name}...`}
              />
              <PromptInputActions>
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  disabled={!isConnected || isLoading || !input.trim()}
                  onClick={handleSubmit}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </PromptInputActions>
            </div>
          </PromptInput>
        </div>
      </div>

      {/* Panel toggle button - always visible on right edge */}
      <button
        type="button"
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-10',
          'flex items-center justify-center',
          'h-12 w-6 rounded-l-md',
          'bg-muted/80 hover:bg-muted border border-r-0 border-border',
          'text-muted-foreground hover:text-foreground',
          isPanelOpen ? 'right-[var(--panel-width)]' : 'right-0'
        )}
        style={{ '--panel-width': `${panelWidth}px` } as React.CSSProperties}
      >
        {isPanelOpen ? (
          <PanelRightClose className="h-4 w-4" />
        ) : (
          <PanelRightOpen className="h-4 w-4" />
        )}
      </button>

      {/* Resize handle */}
      {isPanelOpen && (
        <div
          role="separator"
          tabIndex={0}
          aria-valuenow={panelWidth}
          className="w-1 cursor-col-resize bg-border hover:bg-primary/50"
          onMouseDown={(event) => {
            event.preventDefault()
            setIsResizing(true)
          }}
        />
      )}

      {/* Panel */}
      {isPanelOpen && (
        <div
          className={cn(
            'shrink-0 border-l border-border bg-background',
            isResizing && 'pointer-events-none'
          )}
          style={{ width: `${panelWidth}px` }}
        >
          <RightPanel
            isOpen={isPanelOpen}
            onClose={() => setIsPanelOpen(false)}
            agentId={agentId}
            projectPath={projectPath}
          />
        </div>
      )}
    </div>
  )
}

export { AgentChat }
