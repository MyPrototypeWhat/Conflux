import { contextBridge, ipcRenderer } from 'electron'
import type { AgentConfigs, AgentId, AppConfig, GlobalConfig } from '../types/config'

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export interface ConfigAPI {
  // Global config
  getGlobal: () => Promise<GlobalConfig>
  setGlobal: (config: DeepPartial<GlobalConfig>) => Promise<void>

  // Agent config
  getAgent: <T extends AgentId>(agentId: T) => Promise<AgentConfigs[T]>
  setAgent: <T extends AgentId>(agentId: T, config: DeepPartial<AgentConfigs[T]>) => Promise<void>
  getAllAgents: () => Promise<AgentConfigs>

  // Full config
  getAll: () => Promise<AppConfig>

  // API Keys (sensitive - only has/set/delete, no get)
  hasApiKey: (agentId: AgentId) => Promise<boolean>
  setApiKey: (agentId: AgentId, key: string) => Promise<void>
  deleteApiKey: (agentId: AgentId) => Promise<void>

  // Reset
  resetGlobal: () => Promise<void>
  resetAgent: (agentId: AgentId) => Promise<void>
  resetAll: () => Promise<void>
}

const configAPI: ConfigAPI = {
  // Global config
  getGlobal: () => ipcRenderer.invoke('config:getGlobal'),
  setGlobal: (config) => ipcRenderer.invoke('config:setGlobal', config),

  // Agent config
  getAgent: (agentId) => ipcRenderer.invoke('config:getAgent', agentId),
  setAgent: (agentId, config) => ipcRenderer.invoke('config:setAgent', agentId, config),
  getAllAgents: () => ipcRenderer.invoke('config:getAllAgents'),

  // Full config
  getAll: () => ipcRenderer.invoke('config:getAll'),

  // API Keys
  hasApiKey: (agentId) => ipcRenderer.invoke('config:hasApiKey', agentId),
  setApiKey: (agentId, key) => ipcRenderer.invoke('config:setApiKey', agentId, key),
  deleteApiKey: (agentId) => ipcRenderer.invoke('config:deleteApiKey', agentId),

  // Reset
  resetGlobal: () => ipcRenderer.invoke('config:resetGlobal'),
  resetAgent: (agentId) => ipcRenderer.invoke('config:resetAgent', agentId),
  resetAll: () => ipcRenderer.invoke('config:resetAll'),
}

contextBridge.exposeInMainWorld('configAPI', configAPI)

declare global {
  interface Window {
    configAPI: ConfigAPI
  }
}
