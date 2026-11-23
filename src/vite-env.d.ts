/// <reference types="vite/client" />

interface Window {
  Telegram?: {
    WebApp?: {
      ready?: () => void
      expand?: () => void
      colorScheme?: 'light' | 'dark'
      themeParams?: Record<string, string>
      BackButton?: {
        show?: () => void
        hide?: () => void
        onClick?: (callback: () => void) => void
        offClick?: (callback: () => void) => void
      }
      onEvent?: (event: string, callback: () => void) => void
      offEvent?: (event: string, callback: () => void) => void
    }
  }
}
