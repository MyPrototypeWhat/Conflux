import { useEffect, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import type { GlobalConfig } from '@types/config'

export default function App() {
  const { theme, setTheme, isLoaded } = useTheme()
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Form state
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState('')
  const [timeout, setTimeout] = useState(30000)
  const [autoConnect, setAutoConnect] = useState(false)

  // Load config on mount
  useEffect(() => {
    window.configAPI.getGlobal().then((cfg) => {
      setDefaultWorkingDirectory(cfg.defaultWorkingDirectory)
      setTimeout(cfg.timeout)
      setAutoConnect(cfg.autoConnect)
    })
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      await window.configAPI.setGlobal({
        defaultWorkingDirectory,
        timeout,
        autoConnect,
      })
      setSaveMessage('Settings saved successfully')
      // Auto-hide message after 2 seconds
      globalThis.setTimeout(() => setSaveMessage(null), 2000)
    } catch (error) {
      setSaveMessage('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    await window.configAPI.resetGlobal()
    const cfg = await window.configAPI.getGlobal()
    setTheme(cfg.theme)
    setDefaultWorkingDirectory(cfg.defaultWorkingDirectory)
    setTimeout(cfg.timeout)
    setAutoConnect(cfg.autoConnect)
    setSaveMessage('Settings reset to defaults')
    globalThis.setTimeout(() => setSaveMessage(null), 2000)
  }

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        {saveMessage && (
          <span
            className={`text-sm ${saveMessage.includes('success') ? 'text-green-600' : 'text-red-500'}`}
          >
            {saveMessage}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Appearance */}
          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Appearance
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Theme</label>
                  <p className="text-xs text-muted-foreground">Select your preferred theme</p>
                </div>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as GlobalConfig['theme'])}
                  className="rounded border border-border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </section>

          {/* General */}
          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              General
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Default Working Directory</label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Default directory for all agents (can be overridden per agent)
                </p>
                <input
                  type="text"
                  value={defaultWorkingDirectory}
                  onChange={(e) => setDefaultWorkingDirectory(e.target.value)}
                  placeholder="/path/to/your/projects"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Auto Connect</label>
                  <p className="text-xs text-muted-foreground">
                    Automatically connect to agents on startup
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoConnect(!autoConnect)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    autoConnect ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      autoConnect ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="text-sm font-medium">Request Timeout</label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Default timeout for API requests (milliseconds)
                </p>
                <input
                  type="number"
                  value={timeout}
                  onChange={(e) => setTimeout(Number(e.target.value))}
                  min={1000}
                  max={300000}
                  step={1000}
                  className="w-32 rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={handleReset}
          className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Reset to Defaults
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
