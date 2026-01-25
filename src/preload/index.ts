import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("ping"),
  // A2A Agent 相关 API 将在这里添加
  // sendToAgent: (agentId: string, message: string) => ipcRenderer.invoke("send-to-agent", agentId, message),
});
