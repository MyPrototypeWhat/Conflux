export default function App() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-medium">Codex</h1>
          <p className="text-xs text-muted-foreground">OpenAI's code generation agent</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center border border-border">
        <p className="text-muted-foreground text-sm">Agent view placeholder</p>
      </div>
    </div>
  )
}
