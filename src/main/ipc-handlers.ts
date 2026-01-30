import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { AGENTS } from '../types/agent'
import type { CreateTabOptions, TabMetadata } from '../types/tab'
import { getAgentManager } from './agent-manager'
import { getFileWatcher } from './file-watcher'
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

  ipcMain.handle(
    'tab:replaceAgent',
    (_event, tabId: string, newAgentId: string, metadata?: TabMetadata) => {
      return tabManager.replaceTabAgent(tabId, newAgentId, metadata)
    }
  )

  // Agent operations
  ipcMain.handle('agent:getAll', () => {
    return AGENTS
  })

  ipcMain.handle('agent:getById', (_event, agentId: string) => {
    return AGENTS.find((a) => a.id === agentId) || null
  })

  // Utility
  ipcMain.handle('ping', () => 'pong')

  // Folder picker dialog
  ipcMain.handle('dialog:selectFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Folder',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // File system (read-only)
  const defaultRootPath = process.cwd()
  const ignoredDirs = new Set(['.git', 'node_modules', 'out', 'dist'])

  const resolveWithinRoot = (targetPath: string, rootPath: string) => {
    const resolved = path.resolve(rootPath, targetPath)
    const relative = path.relative(rootPath, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path is outside workspace')
    }
    return resolved
  }

  const buildTree = async (
    currentPath: string,
    rootPath: string,
    depth: number,
    maxEntries: { count: number; limit: number },
    isRoot = false
  ) => {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    const children = [] as Array<{
      name: string
      path: string
      kind: 'file' | 'dir'
      children?: unknown
    }>

    for (const entry of entries) {
      // For root level, don't limit entries as strictly
      if (!isRoot && maxEntries.count >= maxEntries.limit) break
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue

      const entryPath = path.join(currentPath, entry.name)
      const relativePath = path.relative(rootPath, entryPath)
      if (entry.isDirectory()) {
        maxEntries.count += 1
        const node: {
          name: string
          path: string
          kind: 'dir'
          children?: unknown
        } = {
          name: entry.name,
          path: relativePath,
          kind: 'dir',
        }
        // Only recurse if not at root level or if we have budget
        if (depth > 0 && (!isRoot || maxEntries.count < maxEntries.limit / 2)) {
          node.children = await buildTree(entryPath, rootPath, depth - 1, maxEntries, false)
        }
        children.push(node)
      } else {
        maxEntries.count += 1
        children.push({ name: entry.name, path: relativePath, kind: 'file' })
      }
    }

    return children
  }

  ipcMain.handle('fs:getRoot', () => defaultRootPath)

  // Lazy load: get children of a specific directory (depth=1)
  ipcMain.handle('fs:listChildren', async (_event, dirPath: string, rootPath?: string) => {
    const root = rootPath || defaultRootPath
    const resolved = resolveWithinRoot(dirPath, root)
    const entries = await fs.readdir(resolved, { withFileTypes: true })

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    return entries
      .filter((entry) => !ignoredDirs.has(entry.name))
      .map((entry) => ({
        name: entry.name,
        path: path.relative(root, path.join(resolved, entry.name)),
        kind: entry.isDirectory() ? ('dir' as const) : ('file' as const),
      }))
  })

  ipcMain.handle(
    'fs:listDir',
    async (
      _event,
      options: { path?: string; depth?: number; maxEntries?: number; rootPath?: string } = {}
    ) => {
      const rootPath = options.rootPath || defaultRootPath
      const depth = Math.max(0, Math.min(options.depth ?? 3, 10))
      const maxEntries = Math.max(50, Math.min(options.maxEntries ?? 500, 5000))
      const relative = options.path ?? '.'
      const resolved = resolveWithinRoot(relative, rootPath)
      const children = await buildTree(
        resolved,
        rootPath,
        depth,
        { count: 0, limit: maxEntries },
        true
      )
      return {
        name: path.basename(resolved),
        path: path.relative(rootPath, resolved) || '.',
        kind: 'dir' as const,
        children,
      }
    }
  )

  ipcMain.handle('fs:readFile', async (_event, targetPath: string, rootPath?: string) => {
    const root = rootPath || defaultRootPath
    const resolved = resolveWithinRoot(targetPath, root)
    return fs.readFile(resolved, 'utf8')
  })

  ipcMain.handle(
    'fs:writeFile',
    async (_event, targetPath: string, content: string, rootPath?: string) => {
      const root = rootPath || defaultRootPath
      const resolved = resolveWithinRoot(targetPath, root)
      await fs.writeFile(resolved, content, 'utf8')
      return { success: true }
    }
  )

  // File watcher
  const fileWatcher = getFileWatcher()

  ipcMain.handle('fs:watch', async (event, dirPath: string) => {
    await fileWatcher.watchDirectory(dirPath, () => {
      if (event.sender.isDestroyed()) return
      event.sender.send('files:changed', dirPath)
    })
    return { success: true }
  })

  ipcMain.handle('fs:unwatch', async (_event, dirPath: string) => {
    await fileWatcher.unwatchDirectory(dirPath)
    return { success: true }
  })

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

  // Get context ID for a tab (also sets projectPath for the context)
  ipcMain.handle('a2a:getContextId', async (_event) => {
    const activeTab = tabManager.getActiveTab()
    if (!activeTab) return null

    const contextId = agentManager.getContextId(activeTab.id)

    // If tab has projectPath in metadata, associate it with the context
    if (activeTab.metadata?.projectPath) {
      agentManager.setContextProjectPath(contextId, activeTab.metadata.projectPath)
      console.log('[IPC] a2a:getContextId - set projectPath:', {
        tabId: activeTab.id,
        contextId,
        projectPath: activeTab.metadata.projectPath,
      })
    } else {
      console.log('[IPC] a2a:getContextId - no projectPath in metadata:', {
        tabId: activeTab.id,
        contextId,
        metadata: activeTab.metadata,
      })
    }

    return contextId
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
