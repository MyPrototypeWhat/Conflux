import type { Message, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk'
import { ClientFactory } from '@a2a-js/sdk/client'
import { useCallback, useRef, useState } from 'react'
import { resolveAdapterForUrl, type A2AAdapterKind } from '@/lib/a2a-adapter'
import type { ChatMessage, MessageBlock } from '@/lib/a2a/blocks'
import { createA2AEventNormalizer } from '@/lib/a2a/normalizers'
import type { NormalizedBlock } from '@/lib/a2a/normalizers/types'

export type { ChatMessage, MessageBlock, MessageBlockType } from '@/lib/a2a/blocks'

interface UseChatOptions {
  onError?: (error: string) => void
}

const clientFactory = new ClientFactory()

export function useChat(agentId: string, options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const hasTriedConnect = useRef(false)
  const adapterRef = useRef<A2AAdapterKind>('unknown')

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

      const resolved = await resolveAdapterForUrl(url)
      adapterRef.current = resolved.adapter
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
        const contextId = (await window.agentAPI.a2a.getContextId()) || crypto.randomUUID()
        const client = await clientFactory.createFromUrl(serverUrl)
        const adapterKind = adapterRef.current
        const normalizer = createA2AEventNormalizer(adapterKind)

        const stream = client.sendMessageStream({
          message: {
            kind: 'message',
            messageId: crypto.randomUUID(),
            role: 'user',
            contextId,
            parts: [{ kind: 'text', text: content }],
          },
        })

        const applyNormalizedBlock = (normalized: NormalizedBlock) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMessageId) return msg

              const blocks = [...msg.blocks]
              const lastBlockIndex = blocks.length - 1
              const lastBlock = blocks[lastBlockIndex]

              if (normalized.blockType === 'artifact') {
                const artifactId = normalized.artifact.artifactId
                const existingIndex = blocks
                  .map((block, index) => ({ block, index }))
                  .reverse()
                  .find(
                    (entry) =>
                      entry.block.type === 'artifact' &&
                      entry.block.metadata?.artifact?.artifactId === artifactId
                  )?.index

                if (normalized.append && existingIndex !== undefined) {
                  const existingBlock = blocks[existingIndex]
                  const existingArtifact = existingBlock.metadata?.artifact
                  const mergedParts = existingArtifact
                    ? [...existingArtifact.parts, ...normalized.artifact.parts]
                    : normalized.artifact.parts

                  blocks[existingIndex] = {
                    ...existingBlock,
                    metadata: {
                      ...existingBlock.metadata,
                      artifact: {
                        artifactId,
                        name: normalized.artifact.name,
                        parts: mergedParts,
                      },
                    },
                  }
                  return { ...msg, blocks }
                }

                blocks.push({
                  id: crypto.randomUUID(),
                  type: 'artifact',
                  content: '',
                  isStreaming: false,
                  metadata: {
                    artifact: {
                      artifactId,
                      name: normalized.artifact.name,
                      parts: normalized.artifact.parts,
                    },
                  },
                })
                return { ...msg, blocks }
              }

              const deltaText = normalized.text ?? ''
              const blockType = normalized.blockType
              const metadata = normalized.metadata
              const appendToCommand = normalized.appendToCommand

              if (appendToCommand && lastBlock?.type === 'command_execution') {
                const updatedMetadata = { ...lastBlock.metadata }

                if (metadata?.status) updatedMetadata.status = metadata.status as string
                if (metadata?.exitCode !== undefined)
                  updatedMetadata.exitCode = metadata.exitCode as number

                blocks[lastBlockIndex] = {
                  ...lastBlock,
                  content: lastBlock.content + deltaText,
                  metadata: updatedMetadata,
                }
                return { ...msg, blocks }
              }

              const shouldCreateBlock =
                deltaText.length > 0 ||
                blockType === 'command_execution' ||
                blockType === 'file_change' ||
                blockType === 'todo_list' ||
                blockType === 'tool_call' ||
                blockType === 'error'

              if (lastBlock && lastBlock.type === blockType && lastBlock.isStreaming) {
                blocks[lastBlockIndex] = {
                  ...lastBlock,
                  content: lastBlock.content + deltaText,
                }
              } else if (shouldCreateBlock) {
                if (lastBlock?.isStreaming) {
                  blocks[lastBlockIndex] = { ...lastBlock, isStreaming: false }
                }

                const blockMetadata: MessageBlock['metadata'] = {}
                if (blockType === 'command_execution') {
                  const command =
                    (metadata?.command as string | undefined) ||
                    (metadata?.toolName as string | undefined)
                  if (command) blockMetadata.command = command
                  if (metadata?.status) blockMetadata.status = metadata.status as string
                  if (metadata?.exitCode !== undefined)
                    blockMetadata.exitCode = metadata.exitCode as number
                }
                if (blockType === 'web_search' && metadata?.query) {
                  blockMetadata.query = metadata.query as string
                }
                if (blockType === 'todo_list' && metadata?.items) {
                  blockMetadata.items = metadata.items as Array<{
                    text: string
                    completed: boolean
                  }>
                }
                if (blockType === 'file_change' && metadata?.changes) {
                  blockMetadata.changes = metadata.changes as Array<{ path: string; kind: string }>
                }

                blocks.push({
                  id: crypto.randomUUID(),
                  type: blockType,
                  content: deltaText,
                  isStreaming: true,
                  metadata: Object.keys(blockMetadata).length > 0 ? blockMetadata : undefined,
                })
              }

              return { ...msg, blocks }
            })
          )
        }

        for await (const event of stream) {
          if (!event) continue

          if (event.kind === 'status-update') {
            const blocks = normalizer.handleStatusUpdate(event as TaskStatusUpdateEvent)
            blocks.forEach(applyNormalizedBlock)
          } else if (event.kind === 'artifact-update') {
            const blocks = normalizer.handleArtifactUpdate(event as TaskArtifactUpdateEvent)
            blocks.forEach(applyNormalizedBlock)
          } else if (event.kind === 'message') {
            const blocks = normalizer.handleMessage(event as Message)
            blocks.forEach(applyNormalizedBlock)
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
