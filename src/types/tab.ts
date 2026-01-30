export interface TabMetadata {
  projectPath?: string
  [key: string]: unknown
}

export interface Tab {
  id: string
  agentId: string
  title: string
  isActive: boolean
  metadata?: TabMetadata
}

export interface TabState {
  tabs: Tab[]
  activeTabId: string | null
}

export interface CreateTabOptions {
  agentId: string
  title?: string
  metadata?: TabMetadata
}
