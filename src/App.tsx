import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AgentStatus = "pending" | "connected" | "error";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
}

const agents: Agent[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic's CLI coding assistant",
    status: "pending",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI's code generation agent",
    status: "pending",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    description: "Google's terminal AI agent",
    status: "pending",
  },
];

function StatusBadge({ status }: { status: AgentStatus }) {
  const variants: Record<
    AgentStatus,
    { variant: "secondary" | "default" | "destructive"; label: string }
  > = {
    pending: { variant: "secondary", label: "Pending" },
    connected: { variant: "default", label: "Connected" },
    error: { variant: "destructive", label: "Error" },
  };

  const { variant, label } = variants[status];

  return <Badge variant={variant}>{label}</Badge>;
}

export function App() {
  const [isElectron, setIsElectron] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  useEffect(() => {
    setIsElectron(typeof window !== "undefined" && !!window.electronAPI);
  }, []);

  const handlePing = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.ping();
      setPingResult(result);
    }
  };

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
          <h1 className="text-2xl font-bold tracking-tight">Conflux</h1>

        {/* Agent Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{agent.name}</CardTitle>
                  <StatusBadge status={agent.status} />
                </div>
                <CardDescription>{agent.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" className="w-full">
                  Configure
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Electron IPC Test */}
        {isElectron && (
          <Card>
            <CardHeader>
              <CardTitle>Electron IPC</CardTitle>
              <CardDescription>
                Test communication with main process
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Button onClick={handlePing}>Ping</Button>
              {pingResult && (
                <span className="text-sm text-muted-foreground">
                  Response: {pingResult}
                </span>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </main>
  );
}

export default App;
