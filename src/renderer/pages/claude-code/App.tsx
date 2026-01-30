import { AgentChat } from '@/renderer/components/chat/agent-chat'
import { ClaudeIcon } from '@/renderer/components/icons'

export default function App() {
  return <AgentChat agentId="claude-code" name="Claude Code" icon={ClaudeIcon} />
}
