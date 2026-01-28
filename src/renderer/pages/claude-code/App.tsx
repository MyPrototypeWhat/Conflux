import { AgentChat } from '@/components/chat/agent-chat'
import { ClaudeIcon } from '@/components/icons'

export default function App() {
  return <AgentChat agentId="claude-code" name="Claude Code" icon={ClaudeIcon} />
}
