import { AgentChat } from "@/components/chat/agent-chat";
import { OpenAIIcon } from "@/components/icons";

export default function App() {
  return <AgentChat agentId="codex" name="Codex" icon={OpenAIIcon} />;
}
