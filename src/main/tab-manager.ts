import { BaseWindow, WebContentsView } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"
import type { Tab, CreateTabOptions } from "../types/tab"
import { AGENTS } from "../types/agent"

const TABBAR_HEIGHT = 48

export class TabManager {
  private mainWindow: BaseWindow
  private tabbarView: WebContentsView
  private contentViews: Map<string, WebContentsView> = new Map()
  private tabs: Tab[] = []
  private activeTabId: string | null = null
  private tabIdCounter = 0

  constructor(mainWindow: BaseWindow) {
    this.mainWindow = mainWindow
    this.tabbarView = this.createTabbarView()
    this.mainWindow.contentView.addChildView(this.tabbarView)
    this.updateLayout()

    mainWindow.on("resize", () => this.updateLayout())
  }

  private createTabbarView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/tabbar.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      view.webContents.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/tabbar/`)
    } else {
      view.webContents.loadFile(join(__dirname, "../renderer/tabbar/index.html"))
    }

    return view
  }

  private generateTabId(): string {
    return `tab-${++this.tabIdCounter}`
  }

  private getRendererPath(agentId: string): string {
    return `pages/${agentId}`
  }

  createTab(options: CreateTabOptions): Tab {
    const id = this.generateTabId()
    let title = options.title

    if (!title && options.agentId) {
      const agent = AGENTS.find((a) => a.id === options.agentId)
      title = agent?.name || options.agentId
    }

    if (!title) {
      title = "New Tab"
    }

    const tab: Tab = {
      id,
      agentId: options.agentId!,
      title,
      isActive: false,
    }

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/agent.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    const rendererPath = this.getRendererPath(options.agentId!)

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      view.webContents.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/${rendererPath}/`)
    } else {
      view.webContents.loadFile(
        join(__dirname, `../renderer/${rendererPath}/index.html`)
      )
    }

    this.contentViews.set(id, view)
    this.tabs.push(tab)
    this.mainWindow.contentView.addChildView(view)

    this.switchToTab(id)
    this.notifyTabbarUpdate()

    return tab
  }

  switchToTab(tabId: string): boolean {
    const view = this.contentViews.get(tabId)
    if (!view) return false

    // Hide all content views
    for (const [id, v] of this.contentViews) {
      if (id === tabId) {
        v.setVisible(true)
      } else {
        v.setVisible(false)
      }
    }

    // Update tab states
    this.tabs = this.tabs.map((tab) => ({
      ...tab,
      isActive: tab.id === tabId,
    }))

    this.activeTabId = tabId
    this.updateLayout()
    this.notifyTabbarUpdate()

    return true
  }

  closeTab(tabId: string): boolean {
    const view = this.contentViews.get(tabId)
    if (!view) return false

    const tabIndex = this.tabs.findIndex((t) => t.id === tabId)
    if (tabIndex === -1) return false

    // Remove view
    this.mainWindow.contentView.removeChildView(view)
    view.webContents.close()
    this.contentViews.delete(tabId)

    // Remove tab
    this.tabs.splice(tabIndex, 1)

    // Switch to another tab if the closed one was active
    if (this.activeTabId === tabId && this.tabs.length > 0) {
      const newIndex = Math.min(tabIndex, this.tabs.length - 1)
      this.switchToTab(this.tabs[newIndex].id)
    } else if (this.tabs.length === 0) {
      this.activeTabId = null
    }

    this.notifyTabbarUpdate()
    return true
  }

  getTabs(): Tab[] {
    return [...this.tabs]
  }

  getActiveTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeTabId) || null
  }

  private updateLayout(): void {
    const bounds = this.mainWindow.getBounds()
    const contentWidth = bounds.width
    const contentHeight = bounds.height

    // Position tabbar at top
    this.tabbarView.setBounds({
      x: 0,
      y: 0,
      width: contentWidth,
      height: TABBAR_HEIGHT,
    })

    // Position content views below tabbar
    for (const view of this.contentViews.values()) {
      view.setBounds({
        x: 0,
        y: TABBAR_HEIGHT,
        width: contentWidth,
        height: contentHeight - TABBAR_HEIGHT,
      })
    }
  }

  private notifyTabbarUpdate(): void {
    this.tabbarView.webContents.send("tabs:updated", {
      tabs: this.tabs,
      activeTabId: this.activeTabId,
    })
  }

  reorderTabs(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.tabs.length) return
    if (toIndex < 0 || toIndex >= this.tabs.length) return

    const [tab] = this.tabs.splice(fromIndex, 1)
    this.tabs.splice(toIndex, 0, tab)
    this.notifyTabbarUpdate()
  }
}
