const NAV = '[data-testid="app-navigation"]'

/** The nav's own full height formula (themes.css: `--nav-px` × 36 on a bar; 3px from 960 px wide, 2px on a narrow tablet, 3px on a wide phone, 2px on a small one). Only used before the bar has ever settled at this width. */
const fallbackHeight = (width: number) => 36 * (width > 959 || (width > 640 && width < 768) ? 3 : 2)

let settled: { width: number; height: number } | null = null

/**
 * The height the nav has when it is at rest on a scene page (full, not the compact chrome of a Daily or a room), which is what every
 * close-up frames its camera from. The bar's height is a 360 ms transition driven by `--nav-px` / `--nav-c`, so a live measurement
 * taken while a Daily close-up hands over to Scores reads the compact bar (52 px, not 108) and would pin the board 56 px high.
 * A measurement only counts once the bar is fully expanded (`--nav-c` is 0); until then the last settled height at this window
 * width stands in, and before there is one the bar's own formula does.
 */
export function settledNavHeight(): number {
  if (typeof document === 'undefined') return 72
  const width = document.documentElement.clientWidth
  const nav = document.querySelector<HTMLElement>(NAV)
  if (nav && getComputedStyle(nav).getPropertyValue('--nav-c').trim() === '0') {
    const height = nav.getBoundingClientRect().height
    if (height) {
      settled = { width, height }
      return height
    }
  }
  return settled && settled.width === width ? settled.height : fallbackHeight(width)
}
