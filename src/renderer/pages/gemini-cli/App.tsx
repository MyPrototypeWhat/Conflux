import { AgentChat } from '@/components/chat/agent-chat'
import { GeminiIcon } from '@/components/icons'

export default function App() {
  return <AgentChat agentId="gemini-cli" name="Gemini CLI" icon={GeminiIcon} />
}
