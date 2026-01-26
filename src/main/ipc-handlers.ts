import { ipcMain } from 'electron'
import { AGENTS } from '../types/agent'
import type { CreateTabOptions } from '../types/tab'
import { getAgentManager } from './agent-manager'
import { setupConfigHandlers } from './ipc/config-handlers'
import { openSettingsWindow } from './settings-window'
import type { TabManager } from './tab-manager'

export function setupIPCHandlers(tabManager: TabManager): void {
  // Setup config handlers
  setupConfigHandlers()

  // Settings window
  ipcMain.handle('settings:open', () => {
    openSettingsWindow()
  })

  const agentManager = getAgentManager()

  // Forward agent status events to renderer
  agentManager.on('agent:status', (status) => {
    tabManager.broadcastToAllTabs('agent:status', status)
  })
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

  // A2A Agent operations
  ipcMain.handle('a2a:connect', async (_event, agentId: string) => {
    try {
      await agentManager.connectAgent(agentId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  })

  ipcMain.handle('a2a:disconnect', async (_event, agentId: string) => {
    await agentManager.disconnectAgent(agentId)
    return { success: true }
  })

  ipcMain.handle('a2a:isConnected', (_event, agentId: string) => {
    return agentManager.isAgentConnected(agentId)
  })

  // Get server URL for renderer-side A2A communication
  ipcMain.handle('a2a:getServerUrl', (_event, agentId: string) => {
    return agentManager.getServerUrl(agentId)
  })

  // Get context ID for a tab
  ipcMain.handle('a2a:getContextId', async (_event) => {
    const activeTab = tabManager.getActiveTab()
    if (!activeTab) return null
    return agentManager.getContextId(activeTab.id)
  })

  ipcMain.handle('a2a:cancelTask', async (_event, agentId: string, taskId: string) => {
    await agentManager.cancelTask(agentId, taskId)
    return { success: true }
  })

  // Streaming message handler - uses a different pattern for streaming
  ipcMain.on('a2a:sendMessage', async (event, { agentId, content, tabId, requestId }) => {
    try {
      for await (const agentEvent of agentManager.sendMessage(agentId, content, tabId)) {
        // Send each event back to the renderer
        event.sender.send('a2a:messageEvent', { requestId, event: agentEvent })
      }
      // Signal completion
      event.sender.send('a2a:messageComplete', { requestId })
    } catch (error) {
      event.sender.send('a2a:messageEvent', {
        requestId,
        event: {
          type: 'error',
          error: {
            code: 'STREAM_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      })
      event.sender.send('a2a:messageComplete', { requestId })
    }
  })

  // Clear context when tab is closed
  ipcMain.on('a2a:clearContext', (_event, tabId: string) => {
    agentManager.clearContext(tabId)
  })
}
