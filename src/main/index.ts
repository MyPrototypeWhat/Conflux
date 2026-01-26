import { is } from '@electron-toolkit/utils'
import { app, BaseWindow, globalShortcut, session } from 'electron'
import { setupIPCHandlers } from './ipc-handlers'
import { closeDatabase, initializeDatabase } from './storage'
import { TabManager } from './tab-manager'

let tabManager: TabManager | null = null

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
