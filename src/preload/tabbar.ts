import { contextBridge, ipcRenderer } from "electron"
import type { Tab, CreateTabOptions } from "../types/tab"
import type { AgentConfig } from "../types/agent"

export interface TabbarAPI {
  createTab: (options: CreateTabOptions) => Promise<Tab>
  switchTab: (tabId: string) => Promise<boolean>
  closeTab: (tabId: string) => Promise<boolean>
  getAllTabs: () => Promise<Tab[]>
  getActiveTab: () => Promise<Tab | null>
  reorderTabs: (fromIndex: number, toIndex: number) => Promise<Tab[]>
  getAgents: () => Promise<AgentConfig[]>
  onTabsUpdated: (
    callback: (data: { tabs: Tab[]; activeTabId: string | null }) => void
  ) => () => void
}

const tabbarAPI: TabbarAPI = {
  createTab: (options) => ipcRenderer.invoke("tab:create", options),
  switchTab: (tabId) => ipcRenderer.invoke("tab:switch", tabId),
  closeTab: (tabId) => ipcRenderer.invoke("tab:close", tabId),
  getAllTabs: () => ipcRenderer.invoke("tab:getAll"),
  getActiveTab: () => ipcRenderer.invoke("tab:getActive"),
  reorderTabs: (fromIndex, toIndex) =>
    ipcRenderer.invoke("tab:reorder", fromIndex, toIndex),
  getAgents: () => ipcRenderer.invoke("agent:getAll"),
  onTabsUpdated: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { tabs: Tab[]; activeTabId: string | null }
    ) => {
      callback(data)
    }
    ipcRenderer.on("tabs:updated", handler)
    return () => {
      ipcRenderer.removeListener("tabs:updated", handler)
    }
  },
}

contextBridge.exposeInMainWorld("tabbarAPI", tabbarAPI)

declare global {
  interface Window {
    tabbarAPI: TabbarAPI
  }
}
