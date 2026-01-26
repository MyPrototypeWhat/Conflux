import { ipcMain } from 'electron'
import type { AgentConfigs, AgentId, AppConfig, GlobalConfig } from '../../types/config'
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
    repo.setGlobal(config)
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
}
