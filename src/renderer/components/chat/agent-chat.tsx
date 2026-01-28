import { useEffect, useState } from 'react'
import { MessageBlockView } from '@/components/chat/message-block'
import { Button } from '@/components/ui/button'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container'
import { Message, MessageContent } from '@/components/ui/message'
import { PromptInput, PromptInputActions, PromptInputTextarea } from '@/components/ui/prompt-input'
import { type ChatMessage, type MessageBlock, useChat } from '@/hooks/useChat'
import { cn } from '@/lib/utils'

export type AgentChatProps = {
  agentId: string
  name: string
  icon: React.ComponentType<{ size?: number }>
}

function AgentChat({ agentId, name, icon: Icon }: AgentChatProps) {
  const [input, setInput] = useState('')
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

  const handleSubmit = () => {
    if (!input.trim() || isLoading || !isConnected) return
    sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
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
                size="sm"
                disabled={!isConnected || isLoading || !input.trim()}
                onClick={handleSubmit}
              >
                Send
              </Button>
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </div>
  )
}

export { AgentChat }
