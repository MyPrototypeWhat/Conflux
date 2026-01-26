import { useEffect } from 'react'
import { ClaudeIcon } from '@/components/icons'
import { ChatContainer, Message, PromptInput } from '@/components/prompt-kit'
import { useChat } from '@/hooks/useChat'

const AGENT_ID = 'claude-code'

function ClaudeCodeChat() {
  const {
    messages,
    isLoading,
    isConnected,
    isConnecting,
    connectionError,
    sendMessage,
    tryAutoConnect,
  } = useChat(AGENT_ID)

  useEffect(() => {
    tryAutoConnect()
  }, [tryAutoConnect])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded bg-primary/10">
            <ClaudeIcon size={20} />
          </div>
          <div>
            <h1 className="text-sm font-medium">Claude Code</h1>
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
      <ChatContainer>
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
              <ClaudeIcon size={32} />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-medium">Claude Code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a conversation with Claude Code
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <Message
              key={msg.id}
              message={msg}
              avatar={msg.role === 'assistant' ? <ClaudeIcon size={16} /> : undefined}
            />
          ))
        )}
      </ChatContainer>

      {/* Input */}
      <PromptInput
        onSubmit={sendMessage}
        isLoading={isLoading}
        disabled={!isConnected}
        placeholder={isConnected ? 'Ask Claude Code anything...' : 'Connecting to Claude Code...'}
      />
    </div>
  )
}

export default function App() {
  return <ClaudeCodeChat />
}
