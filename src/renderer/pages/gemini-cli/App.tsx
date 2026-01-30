import { AgentChat } from '@/renderer/components/chat/agent-chat'
import { GeminiIcon } from '@/renderer/components/icons'

export default function App() {
  return <AgentChat agentId="gemini-cli" name="Gemini CLI" icon={GeminiIcon} />
}
