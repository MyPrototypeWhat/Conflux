import type { ComponentType } from 'react'
import { ClaudeIcon, DefaultAgentIcon, GeminiIcon, type IconProps, OpenAIIcon } from './AgentIcons'

// Re-export all icon components
export { ClaudeIcon, OpenAIIcon, GeminiIcon, DefaultAgentIcon }
export type { IconProps }

// Agent icon mapping by agentId
export const AgentIconMap: Record<string, ComponentType<IconProps>> = {
  'claude-code': ClaudeIcon,
  codex: OpenAIIcon,
  'gemini-cli': GeminiIcon,
}

// Helper function to get icon component by agentId
export function getAgentIcon(agentId: string): ComponentType<IconProps> {
  return AgentIconMap[agentId] || DefaultAgentIcon
}
