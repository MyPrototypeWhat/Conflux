import { is } from '@electron-toolkit/utils'
import { app, BaseWindow, globalShortcut } from 'electron'
import { setupIPCHandlers } from './ipc-handlers'
import { TabManager } from './tab-manager'

let tabManager: TabManager | null = null

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
