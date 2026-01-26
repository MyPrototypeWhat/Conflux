import { useEffect, useState } from 'react'
import { getAgentIcon } from '@/components/icons'
import type { AgentConfig } from '../../../types/agent'

function AgentCard({ agent, onClick }: { agent: AgentConfig; onClick: () => void }) {
  const IconComponent = getAgentIcon(agent.id)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 p-6 bg-card border border-border hover:border-primary/50 hover:bg-accent transition-colors cursor-pointer"
    >
      <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
        <IconComponent size={28} />
      </div>
      <div className="text-center">
        <h3 className="font-medium text-sm">{agent.name}</h3>
        <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
      </div>
    </button>
  )
}

export default function App() {
  const [agents, setAgents] = useState<AgentConfig[]>([])

  useEffect(() => {
    window.agentAPI.getAllAgents().then((allAgents) => {
      // Filter out the "new-tab" agent itself
      setAgents(allAgents.filter((agent) => agent.id !== 'new-tab'))
    })
  }, [])

  const handleAgentSelect = async (agentId: string) => {
    await window.agentAPI.replaceCurrentTab(agentId)
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-semibold mb-2">New Tab</h1>
        <p className="text-muted-foreground text-sm mb-8">Select an agent to get started</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl w-full">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onClick={() => handleAgentSelect(agent.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
