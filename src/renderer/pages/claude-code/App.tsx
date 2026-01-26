import { ClaudeIcon } from '@/components/icons'

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center">
          <ClaudeIcon size={24} />
        </div>
        <div>
          <h1 className="text-lg font-medium">Claude Code</h1>
          <p className="text-xs text-muted-foreground">Anthropic's CLI coding assistant</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center border border-border">
        <p className="text-muted-foreground text-sm">Agent view placeholder</p>
      </div>
    </div>
  )
}
