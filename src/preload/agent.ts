import { contextBridge, ipcRenderer } from "electron"
import type { AgentConfig } from "../types/agent"

export interface AgentAPI {
  ping: () => Promise<string>
  getAgentInfo: (agentId: string) => Promise<AgentConfig | null>
  getAllAgents: () => Promise<AgentConfig[]>
}

const agentAPI: AgentAPI = {
  ping: () => ipcRenderer.invoke("ping"),
  getAgentInfo: (agentId) => ipcRenderer.invoke("agent:getById", agentId),
  getAllAgents: () => ipcRenderer.invoke("agent:getAll"),
}

contextBridge.exposeInMainWorld("agentAPI", agentAPI)

declare global {
  interface Window {
    agentAPI: AgentAPI
  }
}
