import { File, Folder, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { type TreeDataItem, TreeView } from '@/renderer/components/tree-view'
import { Button } from '@/renderer/components/ui/button'
import { CodeEditor } from '@/renderer/components/ui/code-editor'
import { Input } from '@/renderer/components/ui/input'
import { useTheme } from '@/renderer/hooks/useTheme'
import { cn } from '@/renderer/lib/utils'
import type { CodexConfig } from '@/types/config'

type FileNode = {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: FileNode[]
}

// Convert FileNode to TreeDataItem with lazy loading support
const fileNodeToTreeItem = (node: FileNode, isLoaded: boolean): TreeDataItem => ({
  id: node.path,
  name: node.name,
  icon: node.kind === 'dir' ? Folder : File,
  openIcon: node.kind === 'dir' ? FolderOpen : undefined,
  children:
    node.kind === 'dir'
      ? isLoaded && node.children
        ? node.children.map((child) => fileNodeToTreeItem(child, false))
        : [{ id: `${node.path}/__loading__`, name: 'Loading...', disabled: true }]
      : undefined,
})

export type RightPanelProps = {
  isOpen: boolean
  onClose: () => void
  className?: string
  agentId?: string
  projectPath?: string // From Tab metadata
}

const extensionToLanguage = (filename?: string) => {
  if (!filename) return 'text'
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
      return 'ts'
    case 'tsx':
      return 'tsx'
    case 'js':
      return 'js'
    case 'jsx':
      return 'jsx'
    case 'json':
      return 'json'
    case 'css':
      return 'css'
    case 'html':
      return 'html'
    case 'md':
      return 'md'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'py':
      return 'python'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    default:
      return 'text'
  }
}

const RightPanel = ({
  isOpen,
  onClose,
  className,
  agentId,
  projectPath: initialProjectPath,
}: RightPanelProps) => {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'files' | 'preview' | 'settings'>('files')
  const [previewTab, setPreviewTab] = useState<'editor' | 'browser'>('editor')
  const [browserUrl, setBrowserUrl] = useState('http://localhost:3000')
  const [browserSrc, setBrowserSrc] = useState('http://localhost:3000')
  const [treeData, setTreeData] = useState<TreeDataItem[]>([])
  const [loadedDirs, setLoadedDirs] = useState<Set<string>>(new Set())
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editedContent, setEditedContent] = useState('')
  const [isFileDirty, setIsFileDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)

  // Codex settings state - projectPath comes from Tab metadata (read-only)
  const [codexConfig, setCodexConfig] = useState<CodexConfig | null>(null)
  const projectPath = initialProjectPath || ''
  const [settingsSaveMessage, setSettingsSaveMessage] = useState<string | null>(null)
  const [newWritableRoot, setNewWritableRoot] = useState('')

  // Load root directory children (lazy load - depth 1)
  const _loadDirectory = useCallback(
    async (dirPath: string) => {
      if (loadedDirs.has(dirPath)) return
      const rootPathToUse = projectPath || undefined
      const children = await window.agentAPI.fs.listChildren(dirPath, rootPathToUse)
      setLoadedDirs((prev) => new Set(prev).add(dirPath))
      return children
    },
    [projectPath, loadedDirs]
  )

  // Refresh files function
  const refreshFiles = useCallback(async () => {
    setFilesError(null)
    setTreeData([])
    setLoadedDirs(new Set())

    const rootPathToUse = projectPath || undefined
    try {
      const children = await window.agentAPI.fs.listChildren('.', rootPathToUse)
      setLoadedDirs(new Set(['.']))
      setTreeData(
        children.map((child) => ({
          id: child.path,
          name: child.name,
          icon: child.kind === 'dir' ? Folder : File,
          openIcon: child.kind === 'dir' ? FolderOpen : undefined,
          children:
            child.kind === 'dir'
              ? [{ id: `${child.path}/__loading__`, name: 'Loading...', disabled: true }]
              : undefined,
        }))
      )
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Failed to load files')
    }
  }, [projectPath])

  // Initial load - get root directory contents
  useEffect(() => {
    if (!isOpen) return
    setSelectedFilePath(null)
    setFileContent('')
    refreshFiles()
  }, [isOpen, projectPath, refreshFiles])

  // Watch for file changes
  useEffect(() => {
    if (!isOpen || !projectPath) return

    // Start watching
    window.agentAPI.fs.watch(projectPath)

    // Listen for changes
    const unsubscribe = window.agentAPI.fs.onFilesChanged((changedPath) => {
      if (changedPath === projectPath) {
        refreshFiles()
      }
    })

    return () => {
      unsubscribe()
      window.agentAPI.fs.unwatch(projectPath)
    }
  }, [isOpen, projectPath, refreshFiles])

  // Load Codex config - projectPath comes from Tab metadata
  useEffect(() => {
    if (!isOpen || agentId !== 'codex' || !projectPath) return
    let isMounted = true

    window.configAPI.getCodexConfig(projectPath).then((config) => {
      if (isMounted) setCodexConfig(config)
    })

    return () => {
      isMounted = false
    }
  }, [projectPath, isOpen, agentId])

  useEffect(() => {
    if (!selectedFilePath) return
    let isMounted = true
    const rootPathToUse = projectPath || undefined
    window.agentAPI.fs
      .readFile(selectedFilePath, rootPathToUse)
      .then((content) => {
        if (!isMounted) return
        setFileContent(content)
        setEditedContent(content)
        setIsFileDirty(false)
      })
      .catch((error: unknown) => {
        if (!isMounted) return
        setFileContent('')
        setEditedContent('')
        setFilesError(error instanceof Error ? error.message : 'Failed to read file')
      })
    return () => {
      isMounted = false
    }
  }, [selectedFilePath, projectPath])

  const handleEditorChange = (value: string) => {
    setEditedContent(value)
    setIsFileDirty(value !== fileContent)
  }

  const handleSaveFile = async () => {
    if (!selectedFilePath || !isFileDirty) return
    setIsSaving(true)
    try {
      const rootPathToUse = projectPath || undefined
      await window.agentAPI.fs.writeFile(selectedFilePath, editedContent, rootPathToUse)
      setFileContent(editedContent)
      setIsFileDirty(false)
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Failed to save file')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle tree item selection - load children for directories, select files
  const handleTreeSelect = useCallback(
    async (item: TreeDataItem | undefined) => {
      if (!item || item.disabled) return

      // Check if it's a directory (has children array)
      const isDir = !!item.children

      if (isDir) {
        // Lazy load directory contents if not already loaded
        if (!loadedDirs.has(item.id)) {
          try {
            const rootPathToUse = projectPath || undefined
            const children = await window.agentAPI.fs.listChildren(item.id, rootPathToUse)
            setLoadedDirs((prev) => new Set(prev).add(item.id))

            // Update tree data with loaded children
            const updateChildren = (items: TreeDataItem[]): TreeDataItem[] =>
              items.map((node) => {
                if (node.id === item.id) {
                  return {
                    ...node,
                    children: children.map((child) => ({
                      id: child.path,
                      name: child.name,
                      icon: child.kind === 'dir' ? Folder : File,
                      openIcon: child.kind === 'dir' ? FolderOpen : undefined,
                      children:
                        child.kind === 'dir'
                          ? [
                              {
                                id: `${child.path}/__loading__`,
                                name: 'Loading...',
                                disabled: true,
                              },
                            ]
                          : undefined,
                    })),
                  }
                }
                if (node.children) {
                  return { ...node, children: updateChildren(node.children) }
                }
                return node
              })

            setTreeData((prev) => updateChildren(prev))
          } catch (error) {
            setFilesError(error instanceof Error ? error.message : 'Failed to load directory')
          }
        }
      } else {
        // It's a file - select it for preview
        setSelectedFilePath(item.id)
        setActiveTab('preview')

        // Auto switch to Browser tab for HTML files
        if (item.name.endsWith('.html') || item.name.endsWith('.htm')) {
          const rootPath = projectPath || ''
          const fullPath = rootPath ? `${rootPath}/${item.id}` : item.id
          const fileUrl = `local-file://${fullPath}`
          setBrowserUrl(fileUrl)
          setBrowserSrc(fileUrl)
          setPreviewTab('browser')
        } else {
          setPreviewTab('editor')
        }
      }
    },
    [projectPath, loadedDirs]
  )

  // Codex settings handlers
  const handleSaveSettings = async () => {
    if (!codexConfig || !projectPath) return
    await window.configAPI.setCodexProjectConfig(projectPath, codexConfig)
    setSettingsSaveMessage('Settings saved')
    setTimeout(() => setSettingsSaveMessage(null), 2000)
  }

  const handleAddWritableRoot = () => {
    if (!newWritableRoot || !codexConfig) return
    setCodexConfig({
      ...codexConfig,
      writableRoots: [...codexConfig.writableRoots, newWritableRoot],
    })
    setNewWritableRoot('')
  }

  const handleRemoveWritableRoot = (index: number) => {
    if (!codexConfig) return
    setCodexConfig({
      ...codexConfig,
      writableRoots: codexConfig.writableRoots.filter((_, i) => i !== index),
    })
  }

  const updateConfig = <K extends keyof CodexConfig>(key: K, value: CodexConfig[K]) => {
    if (!codexConfig) return
    setCodexConfig({ ...codexConfig, [key]: value })
  }

  if (!isOpen) return null

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'rounded-sm px-2 py-1 text-xs font-medium',
              activeTab === 'files' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            )}
            onClick={() => setActiveTab('files')}
          >
            Files
          </button>
          <button
            type="button"
            className={cn(
              'rounded-sm px-2 py-1 text-xs font-medium',
              activeTab === 'preview' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            )}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          {agentId === 'codex' && (
            <button
              type="button"
              className={cn(
                'rounded-sm px-2 py-1 text-xs font-medium',
                activeTab === 'settings' ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          )}
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {activeTab === 'files' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="text-xs text-muted-foreground truncate">
              {projectPath || 'Working Directory'}
            </span>
            <Button size="xs" variant="ghost" onClick={refreshFiles}>
              Refresh
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filesError ? (
              <div className="px-3 py-4 text-xs text-red-500">{filesError}</div>
            ) : loadedDirs.has('.') ? (
              treeData.length > 0 ? (
                <TreeView data={treeData} onSelectChange={handleTreeSelect} className="text-sm" />
              ) : (
                <div className="px-3 py-4 text-xs text-muted-foreground">Empty directory</div>
              )
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground">Loading files...</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <button
              type="button"
              className={cn(
                'rounded-sm px-2 py-1 text-xs font-medium',
                previewTab === 'editor' ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
              onClick={() => setPreviewTab('editor')}
            >
              Editor
            </button>
            <button
              type="button"
              className={cn(
                'rounded-sm px-2 py-1 text-xs font-medium',
                previewTab === 'browser' ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
              onClick={() => setPreviewTab('browser')}
            >
              Browser
            </button>
          </div>

          {previewTab === 'editor' && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {!selectedFilePath && (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  Select a file to preview.
                </div>
              )}
              {selectedFilePath && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border px-2 py-1">
                    <span className="text-xs text-muted-foreground truncate">
                      {selectedFilePath}
                      {isFileDirty && <span className="ml-1 text-yellow-500">*</span>}
                    </span>
                    <Button
                      size="xs"
                      variant={isFileDirty ? 'default' : 'outline'}
                      disabled={!isFileDirty || isSaving}
                      onClick={handleSaveFile}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor
                      value={editedContent}
                      language={extensionToLanguage(selectedFilePath)}
                      theme={
                        theme === 'dark' ||
                        (theme === 'system' &&
                          window.matchMedia('(prefers-color-scheme: dark)').matches)
                          ? 'dark'
                          : 'light'
                      }
                      readOnly={false}
                      onChange={handleEditorChange}
                      className="h-full border-0 rounded-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {previewTab === 'browser' && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <Input
                  value={browserUrl}
                  placeholder="http://localhost:3000"
                  onChange={(event) => setBrowserUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setBrowserSrc(browserUrl)
                    }
                  }}
                />
                <Button size="xs" onClick={() => setBrowserSrc(browserUrl)}>
                  Load
                </Button>
              </div>
              {browserSrc ? (
                <iframe
                  className="flex-1 border-t border-border"
                  src={browserSrc}
                  title="Browser Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  Enter a URL to preview.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && agentId === 'codex' && codexConfig && (
        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <div className="space-y-4">
            {/* Thread-bound settings (disabled) */}
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Session Config
                <span className="ml-2 text-[10px] font-normal text-yellow-600">(read-only)</span>
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">
                These settings are fixed when the session is created. Create a new tab to change
                them.
              </p>

              <div className="space-y-3 opacity-60">
                <div className="rounded bg-muted px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Working Directory</p>
                  <p className="text-sm font-mono truncate">{projectPath || 'Not set'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium">Model</label>
                  <select
                    value={codexConfig.model}
                    disabled
                    className="mt-1 w-full rounded border border-border bg-muted px-2 py-1.5 text-xs cursor-not-allowed"
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
                    value={codexConfig.sandboxMode}
                    disabled
                    className="mt-1 w-full rounded border border-border bg-muted px-2 py-1.5 text-xs cursor-not-allowed"
                  >
                    <option value="read-only">Read Only</option>
                    <option value="workspace-write">Workspace Write</option>
                    <option value="danger-full-access">Full Access (Dangerous)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Network Access</label>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px]',
                      codexConfig.networkAccess
                        ? 'bg-green-500/20 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {codexConfig.networkAccess ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Web Search</label>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px]',
                      codexConfig.webSearchEnabled
                        ? 'bg-green-500/20 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {codexConfig.webSearchEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-medium">Approval Policy</label>
                  <select
                    value={codexConfig.approvalPolicy}
                    disabled
                    className="mt-1 w-full rounded border border-border bg-muted px-2 py-1.5 text-xs cursor-not-allowed"
                  >
                    <option value="untrusted">Untrusted (Always Ask)</option>
                    <option value="on-failure">On Failure</option>
                    <option value="on-request">On Request</option>
                    <option value="never">Never (Auto Approve)</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Editable settings */}
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Writable Roots
              </h3>
              <p className="text-[10px] text-muted-foreground mb-1">
                Extra directories Codex can write to (besides working dir)
              </p>
              <div className="mt-1 space-y-1">
                {codexConfig.writableRoots.map((root, idx) => (
                  <div key={`${root}-${idx}`} className="flex items-center gap-1">
                    <span className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                      {root}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveWritableRoot(idx)}
                      className="rounded px-1.5 py-1 text-xs text-red-500 hover:bg-red-500/10"
                    >
                      x
                    </button>
                  </div>
                ))}
                <div className="flex gap-1">
                  <Input
                    value={newWritableRoot}
                    onChange={(e) => setNewWritableRoot(e.target.value)}
                    placeholder="Add writable path"
                    className="text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddWritableRoot()}
                  />
                  <Button size="xs" onClick={handleAddWritableRoot}>
                    +
                  </Button>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reasoning
              </h3>
              <div>
                <label className="text-xs font-medium">Reasoning Effort</label>
                <select
                  value={codexConfig.reasoningEffort}
                  onChange={(e) =>
                    updateConfig(
                      'reasoningEffort',
                      e.target.value as CodexConfig['reasoningEffort']
                    )
                  }
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </section>
          </div>

          {/* Save Button */}
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            {settingsSaveMessage && (
              <span className="text-xs text-green-600">{settingsSaveMessage}</span>
            )}
            <Button size="xs" onClick={handleSaveSettings} disabled={!projectPath}>
              Save Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { RightPanel }
