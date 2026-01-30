import watcher, { type AsyncSubscription } from '@parcel/watcher'

// Directories to ignore
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  '.vscode',
  '.idea',
  'out',
  'target',
  '__pycache__',
])

class FileWatcher {
  private subscriptions: Map<string, AsyncSubscription> = new Map()
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()

  async watchDirectory(dirPath: string, onChange: () => void): Promise<void> {
    // Don't watch if already watching
    if (this.subscriptions.has(dirPath)) return

    try {
      const subscription = await watcher.subscribe(
        dirPath,
        (err, events) => {
          if (err) {
            console.error('[FileWatcher] Error:', err.message)
            return
          }

          // Filter out ignored directories
          const relevantEvents = events.filter((event) => {
            const parts = event.path.split('/')
            return !parts.some((part) => IGNORED_DIRS.has(part))
          })

          if (relevantEvents.length === 0) return

          // Debounce onChange
          const existingTimer = this.debounceTimers.get(dirPath)
          if (existingTimer) clearTimeout(existingTimer)

          const timer = setTimeout(() => {
            onChange()
            this.debounceTimers.delete(dirPath)
          }, 300)
          this.debounceTimers.set(dirPath, timer)
        },
        {
          ignore: [...IGNORED_DIRS].map((dir) => `**/${dir}/**`),
        }
      )

      this.subscriptions.set(dirPath, subscription)
      console.log('[FileWatcher] Watching directory:', dirPath)
    } catch (error) {
      console.error('[FileWatcher] Failed to start watcher:', error)
    }
  }

  async unwatchDirectory(dirPath: string): Promise<void> {
    const subscription = this.subscriptions.get(dirPath)
    if (subscription) {
      await subscription.unsubscribe()
      this.subscriptions.delete(dirPath)
      console.log('[FileWatcher] Stopped watching:', dirPath)
    }

    const timer = this.debounceTimers.get(dirPath)
    if (timer) {
      clearTimeout(timer)
      this.debounceTimers.delete(dirPath)
    }
  }

  async unwatchAll(): Promise<void> {
    const promises = [...this.subscriptions.keys()].map((dirPath) => this.unwatchDirectory(dirPath))
    await Promise.all(promises)
  }
}

let fileWatcherInstance: FileWatcher | null = null

export function getFileWatcher(): FileWatcher {
  if (!fileWatcherInstance) {
    fileWatcherInstance = new FileWatcher()
  }
  return fileWatcherInstance
}
