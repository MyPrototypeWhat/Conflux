export interface Tab {
  id: string
  agentId: string
  title: string
  isActive: boolean
}

export interface TabState {
  tabs: Tab[]
  activeTabId: string | null
}

export interface CreateTabOptions {
  agentId: string
  title?: string
}
