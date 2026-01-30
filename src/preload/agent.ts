import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, AgentStatusUpdate } from '../types/a2a'
import type { AgentConfig } from '../types/agent'
import type { Tab, TabMetadata } from '../types/tab'

// Import config preload to expose configAPI
import './config'

export interface AgentAPI {
  ping: () => Promise<string>
  getAgentInfo: (agentId: string) => Promise<AgentConfig | null>
  getAllAgents: () => Promise<AgentConfig[]>
  replaceCurrentTab: (agentId: string, metadata?: TabMetadata) => Promise<boolean>
  getActiveTab: () => Promise<Tab | null>

  dialog: {
    selectFolder: () => Promise<string | null>
  }

  fs: {
    getRoot: () => Promise<string>
    listDir: (options?: {
      path?: string
      depth?: number
      maxEntries?: number
      rootPath?: string
    }) => Promise<{
      name: string
      path: string
      kind: 'dir'
      children: Array<{
        name: string
        path: string
        kind: 'file' | 'dir'
        children?: unknown
      }>
    }>
    readFile: (path: string, rootPath?: string) => Promise<string>
    writeFile: (path: string, content: string, rootPath?: string) => Promise<{ success: boolean }>
    listChildren: (
      dirPath: string,
      rootPath?: string
    ) => Promise<Array<{ name: string; path: string; kind: 'file' | 'dir' }>>
    watch: (dirPath: string) => Promise<{ success: boolean }>
    unwatch: (dirPath: string) => Promise<{ success: boolean }>
    onFilesChanged: (callback: (dirPath: string) => void) => () => void
  }

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
  replaceCurrentTab: async (agentId, metadata) => {
    const activeTab: Tab | null = await ipcRenderer.invoke('tab:getActive')
    if (!activeTab) return false
    return ipcRenderer.invoke('tab:replaceAgent', activeTab.id, agentId, metadata)
  },
  getActiveTab: () => ipcRenderer.invoke('tab:getActive'),

  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },

  fs: {
    getRoot: () => ipcRenderer.invoke('fs:getRoot'),
    listDir: (options) => ipcRenderer.invoke('fs:listDir', options),
    readFile: (filePath, rootPath) => ipcRenderer.invoke('fs:readFile', filePath, rootPath),
    writeFile: (filePath, content, rootPath) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content, rootPath),
    listChildren: (dirPath, rootPath) => ipcRenderer.invoke('fs:listChildren', dirPath, rootPath),
    watch: (dirPath) => ipcRenderer.invoke('fs:watch', dirPath),
    unwatch: (dirPath) => ipcRenderer.invoke('fs:unwatch', dirPath),
    onFilesChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, dirPath: string) => callback(dirPath)
      ipcRenderer.on('files:changed', handler)
      return () => ipcRenderer.removeListener('files:changed', handler)
    },
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
