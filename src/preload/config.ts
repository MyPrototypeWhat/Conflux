import { contextBridge, ipcRenderer } from 'electron'
import type { AgentConfigs, AgentId, AppConfig, CodexConfig, GlobalConfig } from '../types/config'

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

type Theme = GlobalConfig['theme']

// ===========================================
// Theme auto-initialization
// ===========================================

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

function initializeTheme(): void {
  ipcRenderer.invoke('config:getGlobal').then((config: GlobalConfig) => {
    applyTheme(config.theme)
  })
}

// Listen for theme changes from main process
ipcRenderer.on('config:themeChanged', (_event, theme: Theme) => {
  applyTheme(theme)
})

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  ipcRenderer.invoke('config:getGlobal').then((config: GlobalConfig) => {
    if (config.theme === 'system') {
      applyTheme('system')
    }
  })
})

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTheme)
} else {
  initializeTheme()
}

// ===========================================
// ConfigAPI Interface
// ===========================================

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

  // Theme change listener
  onThemeChanged: (callback: (theme: Theme) => void) => () => void

  // Codex project-level config
  getCodexConfig: (projectPath?: string) => Promise<CodexConfig>
  setCodexProjectConfig: (projectPath: string, config: DeepPartial<CodexConfig>) => Promise<void>
  deleteCodexProjectConfig: (projectPath: string) => Promise<void>
  listCodexProjects: () => Promise<string[]>
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

  // Theme change listener
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: Theme) => callback(theme)
    ipcRenderer.on('config:themeChanged', handler)
    return () => ipcRenderer.removeListener('config:themeChanged', handler)
  },

  // Codex project-level config
  getCodexConfig: (projectPath) => ipcRenderer.invoke('config:getCodexConfig', projectPath),
  setCodexProjectConfig: (projectPath, config) =>
    ipcRenderer.invoke('config:setCodexProjectConfig', projectPath, config),
  deleteCodexProjectConfig: (projectPath) =>
    ipcRenderer.invoke('config:deleteCodexProjectConfig', projectPath),
  listCodexProjects: () => ipcRenderer.invoke('config:listCodexProjects'),
}

contextBridge.exposeInMainWorld('configAPI', configAPI)

declare global {
  interface Window {
    configAPI: ConfigAPI
  }
}
