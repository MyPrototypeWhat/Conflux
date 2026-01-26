import type { GlobalConfig } from '@types/config'
import { useEffect, useState } from 'react'

type Theme = GlobalConfig['theme']

/**
 * Hook to manage theme state
 * Note: Theme is auto-applied by preload/config.ts, this hook only manages React state
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load theme from config on mount
  useEffect(() => {
    window.configAPI.getGlobal().then((config) => {
      setThemeState(config.theme)
      setIsLoaded(true)
    })
  }, [])

  // Listen for theme changes from IPC (cross-window sync)
  useEffect(() => {
    const unsubscribe = window.configAPI.onThemeChanged((newTheme) => {
      setThemeState(newTheme)
    })
    return unsubscribe
  }, [])

  // Update theme
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme)
    await window.configAPI.setGlobal({ theme: newTheme })
  }

  return { theme, setTheme, isLoaded }
}
