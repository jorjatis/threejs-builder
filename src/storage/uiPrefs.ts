export type UiTheme = 'dark' | 'light'

export interface UiPrefs {
  theme: UiTheme
  sidebarExpanded: boolean
}

const KEY = 'threejs-builder-ui'

export const THEME_VIEWER_BG: Record<UiTheme, string> = {
  dark: '#1a1a1e',
  light: '#e4e4e8',
}

const DEFAULTS: UiPrefs = {
  theme: 'dark',
  sidebarExpanded: true,
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<UiPrefs>
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      // Solo contraído si el usuario lo guardó explícitamente como false
      sidebarExpanded:
        typeof parsed.sidebarExpanded === 'boolean'
          ? parsed.sidebarExpanded
          : DEFAULTS.sidebarExpanded,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveUiPrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / private mode */
  }
}

export function applyThemeToDocument(theme: UiTheme): void {
  document.documentElement.dataset.theme = theme
}
