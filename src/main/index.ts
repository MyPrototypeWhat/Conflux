import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app, BaseWindow, globalShortcut, protocol, session } from 'electron'
import { setupIPCHandlers } from './ipc-handlers'
import { closeDatabase, initializeDatabase } from './storage'
import { TabManager } from './tab-manager'

let tabManager: TabManager | null = null

export function getTabManager(): TabManager {
  if (!tabManager) throw new Error('TabManager not initialized')
  return tabManager
}

function setupLocalFileProtocol() {
  // Register custom protocol to serve local files in iframe
  protocol.handle('local-file', async (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
    try {
      const content = await readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      }
      return new Response(content, {
        headers: { 'Content-Type': mimeTypes[ext] || 'text/plain' },
      })
    } catch {
      return new Response('File not found', { status: 404 })
    }
  })
}

function setupCORS() {
  // Allow CORS for local A2A servers
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://localhost:*/*'] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, OPTIONS'],
          'Access-Control-Allow-Headers': ['Content-Type, Accept'],
        },
      })
    }
  )

  // Handle preflight OPTIONS requests
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://localhost:*/*'] },
    (details, callback) => {
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

function createWindow() {
  const mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    title: 'Conflux - A2A Agent Platform',
    show: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
  })

  tabManager = new TabManager(mainWindow)
  setupIPCHandlers(tabManager)

  // Create a default Claude Code tab
  tabManager.createTab({ agentId: 'claude-code' })

  // Register DevTools shortcut in dev mode
  if (is.dev) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      tabManager?.openDevTools()
    })
  }

  // BaseWindow doesn't emit 'ready-to-show', show directly after setup
  mainWindow.show()
}

app.whenReady().then(() => {
  // Initialize database
  initializeDatabase()

  setupLocalFileProtocol()
  setupCORS()
  createWindow()

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Close database connection
  closeDatabase()
})
