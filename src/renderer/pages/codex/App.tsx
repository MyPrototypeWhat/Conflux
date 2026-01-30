import { AgentChat } from '@/renderer/components/chat/agent-chat'
import { OpenAIIcon } from '@/renderer/components/icons'

export default function App() {
  return <AgentChat agentId="codex" name="Codex" icon={OpenAIIcon} />
}
