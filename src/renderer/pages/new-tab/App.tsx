import { useEffect, useState } from 'react'
import { getAgentIcon } from '@/renderer/components/icons'
import type { AgentConfig } from '@/types/agent'
import type { CodexApprovalPolicy, CodexSandboxMode } from '@/types/config'

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

interface CodexSetupConfig {
  projectPath: string
  model: string
  sandboxMode: CodexSandboxMode
  networkAccess: boolean
  webSearchEnabled: boolean
  approvalPolicy: CodexApprovalPolicy
}

// Codex Setup Dialog
function CodexSetupDialog({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: (config: CodexSetupConfig) => void
}) {
  const [projectPath, setProjectPath] = useState('')
  const [model, setModel] = useState('gpt-5-codex')
  const [sandboxMode, setSandboxMode] = useState<CodexSandboxMode>('workspace-write')
  const [networkAccess, setNetworkAccess] = useState(true)
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [approvalPolicy, setApprovalPolicy] = useState<CodexApprovalPolicy>('on-failure')
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleBrowse = async () => {
    const folder = await window.agentAPI.dialog.selectFolder()
    if (folder) {
      setProjectPath(folder)
      setError('')
    }
  }

  const handleCreate = () => {
    if (!projectPath.trim()) {
      setError('Working Directory is required')
      return
    }
    onConfirm({
      projectPath: projectPath.trim(),
      model,
      sandboxMode,
      networkAccess,
      webSearchEnabled,
      approvalPolicy,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-background border border-border rounded-lg shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Create Codex Session</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-medium">
              Working Directory <span className="text-red-500">*</span>
            </label>
            <p className="text-[10px] text-muted-foreground mb-1">
              Codex will execute commands in this directory
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => {
                  setProjectPath(e.target.value)
                  setError('')
                }}
                placeholder="/path/to/project"
                className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="rounded border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                Browse
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="text-xs font-medium">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="gpt-5.2-codex">gpt-5.2-codex (Latest)</option>
              <option value="gpt-5-codex">gpt-5-codex</option>
              <option value="o3-mini">o3-mini</option>
              <option value="o1">o1</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium">Sandbox Mode</label>
            <select
              value={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.value as CodexSandboxMode)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="read-only">Read Only</option>
              <option value="workspace-write">Workspace Write</option>
              <option value="danger-full-access">Full Access (Dangerous)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="space-y-4 pl-2 border-l-2 border-border">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium">Network Access</label>
                  <p className="text-[10px] text-muted-foreground">
                    Allow outbound network requests
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={networkAccess}
                  onChange={(e) => setNetworkAccess(e.target.checked)}
                  className="h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium">Web Search</label>
                  <p className="text-[10px] text-muted-foreground">Enable web search capability</p>
                </div>
                <input
                  type="checkbox"
                  checked={webSearchEnabled}
                  onChange={(e) => setWebSearchEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
              </div>

              <div>
                <label className="text-xs font-medium">Approval Policy</label>
                <select
                  value={approvalPolicy}
                  onChange={(e) => setApprovalPolicy(e.target.value as CodexApprovalPolicy)}
                  className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="untrusted">Untrusted (Ask for all)</option>
                  <option value="on-failure">On Failure</option>
                  <option value="on-request">On Request</option>
                  <option value="never">Never (Auto-approve all)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [showCodexDialog, setShowCodexDialog] = useState(false)

  useEffect(() => {
    window.agentAPI.getAllAgents().then((allAgents) => {
      // Filter out the "new-tab" agent itself
      setAgents(allAgents.filter((agent) => agent.id !== 'new-tab'))
    })
  }, [])

  const handleAgentSelect = async (agentId: string) => {
    if (agentId === 'codex') {
      setShowCodexDialog(true)
      return
    }
    await window.agentAPI.replaceCurrentTab(agentId)
  }

  const handleCodexConfirm = async (config: CodexSetupConfig) => {
    // Save config to database first
    await window.configAPI.setCodexProjectConfig(config.projectPath, {
      workingDirectory: config.projectPath,
      model: config.model,
      sandboxMode: config.sandboxMode,
      networkAccess: config.networkAccess,
      webSearchEnabled: config.webSearchEnabled,
      approvalPolicy: config.approvalPolicy,
    })

    // Replace tab with metadata
    await window.agentAPI.replaceCurrentTab('codex', {
      projectPath: config.projectPath,
    })

    setShowCodexDialog(false)
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

      <CodexSetupDialog
        isOpen={showCodexDialog}
        onClose={() => setShowCodexDialog(false)}
        onConfirm={handleCodexConfirm}
      />
    </div>
  )
}
