import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): void {
  // If window already exists, focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: 'Settings',
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/agent.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for ESM preload scripts
    },
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pages/settings/`)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/pages/settings/index.html'))
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
    settingsWindow = null
  }
}

export function isSettingsWindowOpen(): boolean {
  return settingsWindow !== null && !settingsWindow.isDestroyed()
}
