import { BrowserWindow, ipcMain } from 'electron'
import type {
  AgentConfigs,
  AgentId,
  AppConfig,
  CodexConfig,
  GlobalConfig,
} from '../../types/config'
import { getTabManager } from '../index'
import { getConfigRepository } from '../storage'

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Setup IPC handlers for config operations
 */
export function setupConfigHandlers(): void {
  const repo = getConfigRepository()

  // ============================================
  // Global config
  // ============================================

  ipcMain.handle('config:getGlobal', (): GlobalConfig => {
    return repo.getGlobal()
  })

  ipcMain.handle('config:setGlobal', (_, config: DeepPartial<GlobalConfig>): void => {
    const oldConfig = repo.getGlobal()
    repo.setGlobal(config)

    // Broadcast theme change to all windows/views
    if (config.theme && config.theme !== oldConfig.theme) {
      const tabManager = getTabManager()

      // Broadcast to all content views
      tabManager.broadcastToAllTabs('config:themeChanged', config.theme)

      // Broadcast to tabbar
      tabManager.broadcastToTabbar('config:themeChanged', config.theme)

      // Broadcast to all BrowserWindows (Settings, etc.)
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('config:themeChanged', config.theme)
        }
      }
    }
  })

  // ============================================
  // Agent config
  // ============================================

  ipcMain.handle('config:getAgent', <T extends AgentId>(_, agentId: T): AgentConfigs[T] => {
    return repo.getAgent(agentId)
  })

  ipcMain.handle(
    'config:setAgent',
    <T extends AgentId>(_, agentId: T, config: DeepPartial<AgentConfigs[T]>): void => {
      repo.setAgent(agentId, config)
    }
  )

  ipcMain.handle('config:getAllAgents', (): AgentConfigs => {
    return repo.getAllAgentConfigs()
  })

  // ============================================
  // Full config
  // ============================================

  ipcMain.handle('config:getAll', (): AppConfig => {
    return repo.getFullConfig()
  })

  // ============================================
  // API Keys
  // ============================================

  ipcMain.handle('config:hasApiKey', (_, agentId: AgentId): boolean => {
    return repo.hasApiKey(agentId)
  })

  ipcMain.handle('config:setApiKey', (_, agentId: AgentId, key: string): void => {
    repo.setApiKey(agentId, key)
  })

  ipcMain.handle('config:deleteApiKey', (_, agentId: AgentId): void => {
    repo.deleteApiKey(agentId)
  })

  // ============================================
  // Reset
  // ============================================

  ipcMain.handle('config:resetGlobal', (): void => {
    repo.resetGlobal()
  })

  ipcMain.handle('config:resetAgent', (_, agentId: AgentId): void => {
    repo.resetAgent(agentId)
  })

  ipcMain.handle('config:resetAll', (): void => {
    repo.resetAll()
  })

  // ============================================
  // Codex project-level config
  // ============================================

  ipcMain.handle('config:getCodexConfig', (_, projectPath?: string): CodexConfig => {
    return repo.getCodexConfig(projectPath)
  })

  ipcMain.handle(
    'config:setCodexProjectConfig',
    (_, projectPath: string, config: DeepPartial<CodexConfig>): void => {
      repo.setCodexProjectConfig(projectPath, config)
    }
  )

  ipcMain.handle('config:deleteCodexProjectConfig', (_, projectPath: string): void => {
    repo.deleteCodexProjectConfig(projectPath)
  })

  ipcMain.handle('config:listCodexProjects', (): string[] => {
    return repo.listCodexProjects()
  })
}
