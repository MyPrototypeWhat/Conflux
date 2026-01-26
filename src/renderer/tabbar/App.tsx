import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Tab } from "@types/tab"
import type { AgentConfig } from "@types/agent"

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
}

export function TabBar() {
  const [state, setState] = useState<TabsState>({ tabs: [], activeTabId: null })
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [showAgentMenu, setShowAgentMenu] = useState(false)

  useEffect(() => {
    // Initial load
    window.tabbarAPI.getAllTabs().then((tabs) => {
      const activeTab = tabs.find((t) => t.isActive)
      setState({ tabs, activeTabId: activeTab?.id || null })
    })

    window.tabbarAPI.getAgents().then(setAgents)

    // Subscribe to updates
    const unsubscribe = window.tabbarAPI.onTabsUpdated((data) => {
      setState(data)
    })

    return unsubscribe
  }, [])

  const handleSwitchTab = useCallback((tabId: string) => {
    window.tabbarAPI.switchTab(tabId)
  }, [])

  const handleCloseTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.tabbarAPI.closeTab(tabId)
  }, [])

  const handleCreateAgentTab = useCallback((agentId: string) => {
    window.tabbarAPI.createTab({ agentId })
    setShowAgentMenu(false)
  }, [])

  return (
    <div className="flex h-12 items-center bg-background border-b border-border px-2 select-none">
      {/* Tab list */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => handleSwitchTab(tab.id)}
            className={cn(
              "group flex items-center gap-2 h-8 px-3 cursor-pointer transition-colors",
              "hover:bg-muted",
              tab.isActive && "bg-muted"
            )}
          >
            <span className="text-xs truncate max-w-[120px]">{tab.title}</span>
            <button
              onClick={(e) => handleCloseTab(tab.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:bg-destructive/20 p-0.5 transition-opacity"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* New tab button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAgentMenu(!showAgentMenu)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </Button>

        {showAgentMenu && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border shadow-lg z-50">
            <div className="p-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleCreateAgentTab(agent.id)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                >
                  {agent.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TabBar
