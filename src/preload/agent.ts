import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, AgentStatusUpdate } from '../types/a2a'
import type { AgentConfig } from '../types/agent'
import type { Tab } from '../types/tab'

// Import config preload to expose configAPI
import './config'

export interface AgentAPI {
  ping: () => Promise<string>
  getAgentInfo: (agentId: string) => Promise<AgentConfig | null>
  getAllAgents: () => Promise<AgentConfig[]>
  replaceCurrentTab: (agentId: string) => Promise<boolean>

  // A2A API
  a2a: {
    connect: (agentId: string) => Promise<{ success: boolean; error?: string }>
    disconnect: (agentId: string) => Promise<{ success: boolean }>
    isConnected: (agentId: string) => Promise<boolean>
    getServerUrl: (agentId: string) => Promise<string | null>
    getContextId: () => Promise<string | null>
    sendMessage: (
      agentId: string,
      content: string,
      onEvent: (event: AgentEvent) => void
    ) => Promise<void>
    cancelTask: (agentId: string, taskId: string) => Promise<{ success: boolean }>
    onStatusUpdate: (callback: (status: AgentStatusUpdate) => void) => () => void
  }
}

// Store for pending message requests
const pendingRequests = new Map<string, (event: AgentEvent) => void>()

// Setup listeners for streaming responses
ipcRenderer.on('a2a:messageEvent', (_event, { requestId, event }) => {
  const handler = pendingRequests.get(requestId)
  if (handler) {
    handler(event)
  }
})

ipcRenderer.on('a2a:messageComplete', (_event, { requestId }) => {
  pendingRequests.delete(requestId)
})

const agentAPI: AgentAPI = {
  ping: () => ipcRenderer.invoke('ping'),
  getAgentInfo: (agentId) => ipcRenderer.invoke('agent:getById', agentId),
  getAllAgents: () => ipcRenderer.invoke('agent:getAll'),
  replaceCurrentTab: async (agentId) => {
    const activeTab: Tab | null = await ipcRenderer.invoke('tab:getActive')
    if (!activeTab) return false
    return ipcRenderer.invoke('tab:replaceAgent', activeTab.id, agentId)
  },

  a2a: {
    connect: (agentId) => ipcRenderer.invoke('a2a:connect', agentId),
    disconnect: (agentId) => ipcRenderer.invoke('a2a:disconnect', agentId),
    isConnected: (agentId) => ipcRenderer.invoke('a2a:isConnected', agentId),
    getServerUrl: (agentId) => ipcRenderer.invoke('a2a:getServerUrl', agentId),
    getContextId: () => ipcRenderer.invoke('a2a:getContextId'),

    sendMessage: async (agentId, content, onEvent) => {
      const requestId = crypto.randomUUID()
      const tabId = await ipcRenderer
        .invoke('tab:getActive')
        .then((tab: Tab | null) => tab?.id || '')

      return new Promise<void>((resolve) => {
        pendingRequests.set(requestId, onEvent)

        // Setup completion listener
        const completeHandler = (_: unknown, { requestId: completedId }: { requestId: string }) => {
          if (completedId === requestId) {
            pendingRequests.delete(requestId)
            ipcRenderer.removeListener('a2a:messageComplete', completeHandler)
            resolve()
          }
        }
        ipcRenderer.on('a2a:messageComplete', completeHandler)

        // Send the message
        ipcRenderer.send('a2a:sendMessage', { agentId, content, tabId, requestId })
      })
    },

    cancelTask: (agentId, taskId) => ipcRenderer.invoke('a2a:cancelTask', agentId, taskId),

    onStatusUpdate: (callback) => {
      const handler = (_: unknown, status: AgentStatusUpdate) => callback(status)
      ipcRenderer.on('agent:status', handler)
      return () => ipcRenderer.removeListener('agent:status', handler)
    },
  },
}

contextBridge.exposeInMainWorld('agentAPI', agentAPI)

declare global {
  interface Window {
    agentAPI: AgentAPI
  }
}
