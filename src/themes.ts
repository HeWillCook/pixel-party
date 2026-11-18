export const THEMES = [
  {
    id: 'porch',
    label: 'Porch at Sunset',
    description: 'Painted wood and cream paper against the sunset sea.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'porch'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'porch'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
