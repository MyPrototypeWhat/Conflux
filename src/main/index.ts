import { app, BaseWindow } from "electron"
import { TabManager } from "./tab-manager"
import { setupIPCHandlers } from "./ipc-handlers"

let tabManager: TabManager | null = null

function createWindow() {
  const mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    title: "Conflux - A2A Agent Platform",
    show: false,
  })

  tabManager = new TabManager(mainWindow)
  setupIPCHandlers(tabManager)

  // Create a default Claude Code tab
  tabManager.createTab({ agentId: "claude-code" })

  mainWindow.once("ready-to-show", () => {
    mainWindow.show()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
