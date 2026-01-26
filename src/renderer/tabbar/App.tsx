import { useCallback, useEffect, useState } from 'react'
import { getAgentIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Tab } from '../../types/tab'

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
}

export function TabBar() {
  const [state, setState] = useState<TabsState>({ tabs: [], activeTabId: null })

  useEffect(() => {
    // Initial load
    window.tabbarAPI.getAllTabs().then((tabs) => {
      const activeTab = tabs.find((t) => t.isActive)
      setState({ tabs, activeTabId: activeTab?.id || null })
    })

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

  const handleNewTab = useCallback(() => {
    window.tabbarAPI.createTab({ agentId: 'new-tab' })
  }, [])

  return (
    <div
      className="flex h-12 items-center bg-background border-b border-border pr-2 select-none"
      style={{ paddingLeft: '80px', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Tab list */}
      <div
        className="flex-1 flex items-center gap-1 overflow-x-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {state.tabs.map((tab) => {
          const IconComponent = getAgentIcon(tab.agentId)
          return (
            <div
              role="tab"
              tabIndex={0}
              key={tab.id}
              onClick={() => handleSwitchTab(tab.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleSwitchTab(tab.id)}
              className={cn(
                'group flex items-center gap-2 h-8 px-3 cursor-pointer transition-colors',
                'hover:bg-muted',
                tab.isActive && 'bg-muted'
              )}
            >
              <IconComponent size={14} />
              <span className="text-xs truncate max-w-[120px]">{tab.title}</span>
              <button
                type="button"
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
          )
        })}
      </div>

      {/* New tab button */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button variant="ghost" size="icon-sm" onClick={handleNewTab}>
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
      </div>
    </div>
  )
}

export default TabBar
