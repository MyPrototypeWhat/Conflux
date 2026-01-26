import { contextBridge, ipcRenderer } from 'electron'
import type { AgentConfig } from '../types/agent'
import type { Tab } from '../types/tab'

export interface AgentAPI {
  ping: () => Promise<string>
  getAgentInfo: (agentId: string) => Promise<AgentConfig | null>
  getAllAgents: () => Promise<AgentConfig[]>
  replaceCurrentTab: (agentId: string) => Promise<boolean>
}

const agentAPI: AgentAPI = {
  ping: () => ipcRenderer.invoke('ping'),
  getAgentInfo: (agentId) => ipcRenderer.invoke('agent:getById', agentId),
  getAllAgents: () => ipcRenderer.invoke('agent:getAll'),
  replaceCurrentTab: async (agentId) => {
    const activeTab: Tab | null = await ipcRenderer.invoke('tab:getActive')
    if (!activeTab) return false
    return ipcRenderer.invoke('tab:replaceAgent', activeTab.id, agentId)
  },
}

contextBridge.exposeInMainWorld('agentAPI', agentAPI)

declare global {
  interface Window {
    agentAPI: AgentAPI
  }
}
