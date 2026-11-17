export const THEMES = [
  {
    id: 'arcade',
    label: 'Arcade Night',
    description: 'Deep midnight indigo with warm amber, magenta, and crisp 16-color pixel contrast.',
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Neutral dark theme.',
  },
  {
    id: 'paper',
    label: 'Warm Paper',
    description: 'Light cream studio theme.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'arcade'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'arcade'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
