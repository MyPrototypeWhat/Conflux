import { ipcMain } from 'electron'
import { AGENTS } from '../types/agent'
import type { CreateTabOptions } from '../types/tab'
import type { TabManager } from './tab-manager'

export function setupIPCHandlers(tabManager: TabManager): void {
  // Tab operations
  ipcMain.handle('tab:create', (_event, options: CreateTabOptions) => {
    return tabManager.createTab(options)
  })

  ipcMain.handle('tab:switch', (_event, tabId: string) => {
    return tabManager.switchToTab(tabId)
  })

  ipcMain.handle('tab:close', (_event, tabId: string) => {
    return tabManager.closeTab(tabId)
  })

  ipcMain.handle('tab:getAll', () => {
    return tabManager.getTabs()
  })

  ipcMain.handle('tab:getActive', () => {
    return tabManager.getActiveTab()
  })

  ipcMain.handle('tab:reorder', (_event, fromIndex: number, toIndex: number) => {
    tabManager.reorderTabs(fromIndex, toIndex)
    return tabManager.getTabs()
  })

  ipcMain.handle('tab:replaceAgent', (_event, tabId: string, newAgentId: string) => {
    return tabManager.replaceTabAgent(tabId, newAgentId)
  })

  // Agent operations
  ipcMain.handle('agent:getAll', () => {
    return AGENTS
  })

  ipcMain.handle('agent:getById', (_event, agentId: string) => {
    return AGENTS.find((a) => a.id === agentId) || null
  })

  // Utility
  ipcMain.handle('ping', () => 'pong')
}
