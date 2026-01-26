import { useEffect, useState } from 'react'
import type { GlobalConfig } from '@types/config'

type Theme = GlobalConfig['theme']

/**
 * Apply theme to document
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement

  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system: follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

/**
 * Hook to manage theme
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load theme from config on mount
  useEffect(() => {
    window.configAPI.getGlobal().then((config) => {
      setThemeState(config.theme)
      applyTheme(config.theme)
      setIsLoaded(true)
    })
  }, [])

  // Listen for system theme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyTheme('system')

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Update theme
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    await window.configAPI.setGlobal({ theme: newTheme })
  }

  return { theme, setTheme, isLoaded }
}

/**
 * Initialize theme on app startup (call once in main entry)
 */
export function initTheme(): void {
  // Check if configAPI is available (preload loaded)
  if (typeof window !== 'undefined' && window.configAPI) {
    window.configAPI.getGlobal().then((config) => {
      applyTheme(config.theme)
    })
  }
}
