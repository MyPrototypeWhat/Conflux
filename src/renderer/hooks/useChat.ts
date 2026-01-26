import { useCallback, useRef, useState } from 'react'

export type MessageBlockType = 'text' | 'reasoning' | 'tool_call' | 'file_change'

export interface MessageBlock {
  id: string
  type: MessageBlockType
  content: string
  isStreaming?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string // For user messages, or legacy compatibility
  blocks: MessageBlock[] // For assistant messages with multiple blocks
  timestamp: number
  isStreaming?: boolean
}

interface UseChatOptions {
  onError?: (error: string) => void
}

/**
 * A2A Client - handles communication with A2A server in renderer process
 * This allows DevTools to capture network requests for debugging
 */
class A2AClient {
  private serverUrl: string

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl
  }

  async *sendMessage(
    content: string,
    contextId: string
  ): AsyncGenerator<{ type: string; text?: string; error?: string; itemType?: string }> {
    const requestBody = {
      jsonrpc: '2.0',
      method: 'message/stream',
      id: crypto.randomUUID(),
      params: {
        contextId,
        message: {
          messageId: crypto.randomUUID(),
          role: 'user',
          parts: [{ kind: 'text', text: content }],
        },
      },
    }

    console.log('[A2A Client] Request URL:', this.serverUrl)
    console.log('[A2A Client] Request Body:', JSON.stringify(requestBody, null, 2))

    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('[A2A Client] Response Status:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('[A2A Client] Error Response:', errorText)
      yield { type: 'error', error: `HTTP ${response.status}: ${response.statusText}` }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            yield { type: 'done' }
            return
          }

          try {
            const event = JSON.parse(data)
            console.log('[A2A Client] SSE Event:', event)

            // Parse A2A event format
            if (event.result) {
              const result = event.result

              // Handle different result kinds
              if (result.kind === 'task') {
                // Initial task creation - no text to show yet
                console.log('[A2A Client] Task created:', result.id)
              } else if (result.kind === 'status-update') {
                // Status update - may contain message with text
                const status = result.status
                const message = status?.message

                // Check for message in status
                if (message?.parts) {
                  const itemType = message.metadata?.itemType as string | undefined
                  for (const part of message.parts) {
                    if (part.kind === 'text' && part.text) {
                      yield { type: 'text_delta', text: part.text, itemType }
                    }
                  }
                }

                // Check if task is complete or failed
                if (
                  status?.state === 'completed' ||
                  status?.state === 'failed' ||
                  status?.state === 'input-required'
                ) {
                  if (result.final) {
                    yield { type: 'done' }
                    return
                  }
                }

                // Check for error in metadata
                if (result.metadata?.error) {
                  yield { type: 'error', error: result.metadata.error }
                }
              }

              // Legacy format support: direct text content
              if (result.text) {
                yield { type: 'text_delta', text: result.text }
              }

              // Legacy format support: direct message parts
              if (result.message?.parts && result.kind !== 'status-update') {
                for (const part of result.message.parts) {
                  if (part.kind === 'text' && part.text) {
                    yield { type: 'text_delta', text: part.text }
                  }
                }
              }
            }

            // Handle error
            if (event.error) {
              yield { type: 'error', error: event.error.message || 'Unknown error' }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    yield { type: 'done' }
  }
}

export function useChat(agentId: string, options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const hasTriedConnect = useRef(false)

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return

    setIsConnecting(true)
    setConnectionError(null)

    try {
      // First connect to start the server
      const result = await window.agentAPI.a2a.connect(agentId)
      if (!result.success) {
        const error = result.error || 'Connection failed'
        setConnectionError(error)
        options.onError?.(error)
        return
      }

      // Get the server URL
      const url = await window.agentAPI.a2a.getServerUrl(agentId)
      if (!url) {
        const error = 'Failed to get server URL'
        setConnectionError(error)
        options.onError?.(error)
        return
      }

      setServerUrl(url)
      setIsConnected(true)
      console.log('[useChat] Connected to server:', url)
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Connection failed'
      setConnectionError(error)
      options.onError?.(error)
    } finally {
      setIsConnecting(false)
    }
  }, [agentId, isConnecting, isConnected, options])

  const disconnect = useCallback(async () => {
    await window.agentAPI.a2a.disconnect(agentId)
    setIsConnected(false)
    setServerUrl(null)
  }, [agentId])

  const tryAutoConnect = useCallback(() => {
    if (!hasTriedConnect.current) {
      hasTriedConnect.current = true
      connect()
    }
  }, [connect])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading || !serverUrl) return

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        blocks: [],
        timestamp: Date.now(),
      }

      // Create assistant message with empty blocks
      const assistantMessageId = crypto.randomUUID()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        blocks: [],
        timestamp: Date.now(),
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsLoading(true)

      try {
        // Get context ID from main process
        const contextId = (await window.agentAPI.a2a.getContextId()) || crypto.randomUUID()

        // Use A2A client in renderer for debugging
        const client = new A2AClient(serverUrl)

        for await (const event of client.sendMessage(content, contextId)) {
          if (event.type === 'text_delta' && event.text) {
            // Map itemType to block type
            const itemType = event.itemType as string | undefined
            let blockType: MessageBlockType = 'text'
            if (itemType === 'reasoning') blockType = 'reasoning'
            else if (itemType === 'tool_call') blockType = 'tool_call'
            else if (itemType === 'file_change') blockType = 'file_change'

            // Update message with new block content
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessageId) return msg

                const blocks = [...msg.blocks]
                // Find last block of same type that's streaming
                const lastBlockIndex = blocks.length - 1
                const lastBlock = blocks[lastBlockIndex]

                if (lastBlock && lastBlock.type === blockType && lastBlock.isStreaming) {
                  // Append to existing block
                  blocks[lastBlockIndex] = {
                    ...lastBlock,
                    content: lastBlock.content + event.text,
                  }
                } else {
                  // Mark previous block as done (if exists) and create new block
                  if (lastBlock && lastBlock.isStreaming) {
                    blocks[lastBlockIndex] = { ...lastBlock, isStreaming: false }
                  }
                  blocks.push({
                    id: crypto.randomUUID(),
                    type: blockType,
                    content: event.text || '',
                    isStreaming: true,
                  })
                }

                return { ...msg, blocks }
              })
            )
          } else if (event.type === 'error') {
            const error = event.error || 'Unknown error'
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessageId) return msg
                return {
                  ...msg,
                  blocks: [
                    ...msg.blocks,
                    {
                      id: crypto.randomUUID(),
                      type: 'text',
                      content: `Error: ${error}`,
                      isStreaming: false,
                    },
                  ],
                }
              })
            )
            options.onError?.(error)
            break
          }
        }

        // Mark assistant message and all blocks as done
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg
            return {
              ...msg,
              isStreaming: false,
              blocks: msg.blocks.map((b) => ({ ...b, isStreaming: false })),
            }
          })
        )
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to send message'
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg
            return {
              ...msg,
              isStreaming: false,
              blocks: [
                ...msg.blocks.map((b) => ({ ...b, isStreaming: false })),
                {
                  id: crypto.randomUUID(),
                  type: 'text' as const,
                  content: `Error: ${error}`,
                  isStreaming: false,
                },
              ],
            }
          })
        )
        options.onError?.(error)
      } finally {
        setIsLoading(false)
      }
    },
    [serverUrl, isLoading, options]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isLoading,
    isConnected,
    isConnecting,
    connectionError,
    serverUrl,
    sendMessage,
    clearMessages,
    connect,
    disconnect,
    tryAutoConnect,
  }
}
