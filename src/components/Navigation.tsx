import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthProfileReady, signOut } from 'deepspace'
import { Menu, X } from 'lucide-react'
import type { Role } from '../constants'
import { nav } from '../nav'
import { DETAIL } from '../scene/detail'
import { P } from '../scene/palette'
import { drawPorchRoof } from '../scene/porch/drawPorch'
import { paintMailbox } from '../scene/porch/houseArt'
import { defineSprite, drawSprite, type Sprite } from '../scene/sprite'
import { dispatchSceneNavigation, isPrimaryClick, markPorchReturn as markPorchReturnFrom, requestSignIn, type SceneNavKind } from './porch/returnFlag'
import { prefetchRoute } from '../prefetch-routes'
import { useDailyLock } from '../hooks/useDailyLock'
import { useMyProfile } from '../hooks/useProfile'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui'

const woodPalette = { a: P.wood[0], b: P.wood[1], c: P.wood[2], d: P.wood[3], e: P.wood[4], f: P.sun[4], g: P.flame[1], h: P.paper[3], i: P.sea[1], j: P.sun[2] }
function plank(width: number, active = false): Sprite {
  return defineSprite(Array.from({ length: 16 }, (_, y) => Array.from({ length: width }, (_, x) => {
    if (y < 4) return x === 7 || x === 8 || x === width - 9 || x === width - 8 ? (y % 2 ? 'b' : 'h') : '.'
    if ((y === 4 || y === 15) && (x < 2 || x >= width - 2)) return '.'
    if (y === 4 || y === 15 || x === 0 || x === width - 1) return 'a'
    if (y === 5 || x === width - 2) return 'f'
    if ((x === 3 || x === width - 4) && (y === 7 || y === 13)) return 'b'
    if (y === 7 && x > 4 && x < 8) return active ? 'd' : 'c'
    return active ? 'h' : 'e'
  }).join('')), woodPalette)
}
const sign = plank(36)
const activeSign = plank(36, true)
/**
 * The Pixle wordmark signs. Both boards are painted by `buildSign` from a glyph table, the letter
 * positions, the vertical zone rows, the row bands that pick a gradient step and the plank geometry,
 * so the full and compact signs share one painter and differ only in the numbers.
 *
 * Palette keys: a/b outline + drop shadow (wood[0]), B shade row, c board fill, f bevel row,
 * h/j light + dark chain links, n nail head, p..s the warm "pix" ramp, t..w the cool "le" ramp,
 * d/e/g the aqua dot core, its glint pixel and its halo.
 */
const logoPalette = {
  a: P.wood[0], b: P.wood[0], B: P.woodMid[0], c: P.wood[1], f: P.woodMid[1],
  h: P.paper[3], j: P.wood[0], n: P.stone[3],
  p: P.flame[4], q: P.flame[3], r: P.flame[2], s: P.flame[1],
  t: P.sky[5], u: P.sky[4], v: P.sky[3], w: P.ui[2],
  // The i's dot is the wordmark's one bright pixel: an aqua a step past the sea ramp, a paper glint, a sea halo.
  d: '#8ce8dc', e: P.paper[4], g: P.sea[3],
}
type SignZone = 'A' | 'R' | 'D'
/** A glyph split into its ascender, x-height and descender rows; `#` is ink, `.` is empty. */
interface SignGlyph { A?: readonly string[]; R: readonly string[]; D?: readonly string[] }
interface SignLetter { glyph: SignGlyph; x: number; ramp: 'pix' | 'le' }
/** A row range inside one zone, and which step of the letter's ramp it takes (1-based). */
interface SignBand { zone: SignZone; from: number; to: number; band: number }
interface SignDot { x: number; y: number; size: number; halo: boolean }
interface SignBoard {
  width: number; height: number
  topRow: number; bevelRow: number; shadeRow: number; bottomRow: number
  chainRows: number; chainXs: readonly number[]; nailRow: number | null
  /** Pixels shaved off each corner along the top/bottom rows, for a rounded plank end. */
  cornerCut: number
}
interface SignSpec {
  board: SignBoard
  /** First row of each zone. */
  zones: Record<SignZone, number>
  bands: readonly SignBand[]
  ramps: Record<SignLetter['ramp'], readonly string[]>
  letters: readonly SignLetter[]
  dots: readonly SignDot[]
}
const showRows = (row: string, count: number) => Array.from({ length: count }, () => row)
function buildSign({ board, zones, bands, ramps, letters, dots }: SignSpec): Sprite {
  const { width, height } = board
  const left = 1, right = width - 2
  const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'))
  const put = (x: number, y: number, colour: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels[y][x] = colour
  }
  // The plank: fill, top bevel, bottom shade, then the dark border ring and its cut corners.
  for (let y = board.bevelRow + 1; y < board.shadeRow; y++) for (let x = left + 1; x < right; x++) put(x, y, 'c')
  for (let x = left + 1; x < right; x++) { put(x, board.bevelRow, 'f'); put(x, board.shadeRow, 'B') }
  for (let x = left; x <= right; x++) { put(x, board.topRow, 'a'); put(x, board.bottomRow, 'a') }
  for (let y = board.topRow; y <= board.bottomRow; y++) { put(left, y, 'a'); put(right, y, 'a') }
  for (let step = 0; step < board.cornerCut; step++) {
    for (const x of [left + step, right - step]) { put(x, board.topRow, '.'); put(x, board.bottomRow, '.') }
  }
  for (const x of [left, right]) { put(x, board.topRow + 1, '.'); put(x, board.bottomRow - 1, '.') }
  for (let row = 0; row < board.chainRows; row++) for (const x of board.chainXs) put(x, row, row % 2 ? 'j' : 'h')
  if (board.nailRow !== null) for (const x of board.chainXs) put(x, board.nailRow, 'n')
  // Ink marks first, then the dot: the shadow and the 1px outline wrap both, fills and dots paint last.
  const ink: { x: number; y: number; colour: string }[] = []
  for (const { glyph, x, ramp } of letters) {
    const steps = ramps[ramp]
    for (const zone of ['A', 'R', 'D'] as const) {
      const rows = glyph[zone]
      if (!rows) continue
      const band = (index: number) => bands.find((rule) => rule.zone === zone && index >= rule.from && index <= rule.to)?.band ?? 1
      rows.forEach((row, index) => Array.from(row).forEach((pixel, column) => {
        if (pixel === '#') ink.push({ x: x + column, y: zones[zone] + index, colour: steps[band(index) - 1] })
      }))
    }
  }
  // A dot's core, and the 1px halo ring around it, are part of the outlined shape; the halo paints over its own outline.
  const core = (dot: SignDot) => {
    const points: [number, number][] = []
    for (let dy = 0; dy < dot.size; dy++) for (let dx = 0; dx < dot.size; dx++) points.push([dot.x + dx, dot.y + dy])
    return points
  }
  const halo = (dot: SignDot) => {
    const points: [number, number][] = []
    // Edges only, no corners, so the glow reads round rather than as a framed square.
    for (let step = 0; step < dot.size; step++) {
      points.push([dot.x + step, dot.y - 1], [dot.x + step, dot.y + dot.size], [dot.x - 1, dot.y + step], [dot.x + dot.size, dot.y + step])
    }
    return points
  }
  const shape: [number, number][] = [...ink.map(({ x, y }): [number, number] => [x, y]), ...dots.flatMap(core), ...dots.filter((dot) => dot.halo).flatMap(halo)]
  for (const [x, y] of shape) put(x + 1, y + 1, 'b')
  for (const [x, y] of shape) { put(x - 1, y, 'a'); put(x + 1, y, 'a'); put(x, y - 1, 'a'); put(x, y + 1, 'a') }
  for (const { x, y, colour } of ink) put(x, y, colour)
  for (const [x, y] of dots.filter((dot) => dot.halo).flatMap(halo)) put(x, y, 'g')
  for (const [x, y] of dots.flatMap(core)) put(x, y, 'd')
  for (const dot of dots) put(dot.x, dot.y, 'e')
  return defineSprite(pixels.map((row) => row.join('')), logoPalette)
}
/** Full sign, 70x34: 3px strokes on a 5/12/4 zone grid, 3px letter gaps from x=8. */
const logoSign = buildSign({
  board: { width: 70, height: 34, topRow: 4, bevelRow: 5, shadeRow: 32, bottomRow: 33, chainRows: 4, chainXs: [12, 57], nailRow: 5, cornerCut: 2 },
  zones: { A: 8, R: 13, D: 25 },
  bands: [
    { zone: 'A', from: 0, to: 4, band: 1 },
    { zone: 'R', from: 0, to: 2, band: 1 }, { zone: 'R', from: 3, to: 6, band: 2 }, { zone: 'R', from: 7, to: 10, band: 3 }, { zone: 'R', from: 11, to: 11, band: 4 },
    { zone: 'D', from: 0, to: 3, band: 4 },
  ],
  ramps: { pix: ['p', 'q', 'r', 's'], le: ['t', 'u', 'v', 'w'] },
  letters: [
    {
      x: 8, ramp: 'pix',
      glyph: {
        R: ['#########..', '##########.', '###########', ...showRows('###.....###', 6), '###########', '##########.', '#########..'],
        D: showRows('###........', 4),
      },
    },
    { x: 22, ramp: 'pix', glyph: { R: showRows('###', 12) } },
    {
      x: 28, ramp: 'pix',
      glyph: {
        R: [
          '###......###', '###......###', '.###....###.', '..###..###..', '...######...', '....####....',
          '....####....', '...######...', '..###..###..', '.###....###.', '###......###', '###......###',
        ],
      },
    },
    { x: 43, ramp: 'le', glyph: { A: showRows('###..', 5), R: [...showRows('###..', 10), '####.', '.####'] } },
    {
      x: 51, ramp: 'le',
      glyph: {
        R: [
          '..#######..', '.#########.', '###########', '###.....###', '###.....###', '###########',
          '###########', '###........', '###........', '###########', '.##########', '..#########',
        ],
      },
    },
  ],
  dots: [{ x: 22, y: 8, size: 3, halo: true }],
})
/** Compact sign, 43x20: 2px strokes on a 3/7/2 zone grid, 2px letter gaps from x=4. */
const compactLogoSign = buildSign({
  board: { width: 43, height: 20, topRow: 2, bevelRow: 3, shadeRow: 18, bottomRow: 19, chainRows: 2, chainXs: [7, 35], nailRow: null, cornerCut: 1 },
  zones: { A: 5, R: 8, D: 15 },
  bands: [
    { zone: 'A', from: 0, to: 2, band: 1 },
    { zone: 'R', from: 0, to: 2, band: 1 }, { zone: 'R', from: 3, to: 4, band: 2 }, { zone: 'R', from: 5, to: 6, band: 3 },
    { zone: 'D', from: 0, to: 1, band: 3 },
  ],
  ramps: { pix: ['p', 'q', 'r', 's'], le: ['t', 'u', 'v', 'w'] },
  letters: [
    { x: 4, ramp: 'pix', glyph: { R: ['######.', ...showRows('##...##', 5), '######.'], D: showRows('##.....', 2) } },
    { x: 13, ramp: 'pix', glyph: { R: showRows('##', 7) } },
    {
      x: 17, ramp: 'pix',
      glyph: { R: ['##....##', '.##..##.', '..####..', '...##...', '..####..', '.##..##.', '##....##'] },
    },
    { x: 27, ramp: 'le', glyph: { A: showRows('##.', 3), R: [...showRows('##.', 5), '###', '.##'] } },
    { x: 32, ramp: 'le', glyph: { R: ['.#####.', '##...##', '##...##', '#######', '##.....', '##.....', '.######'] } },
  ],
  dots: [{ x: 13, y: 5, size: 2, halo: false }],
})
function PorchNavRoof({ pathname }: { pathname: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const container = canvas?.parentElement
    const nav = container?.parentElement
    if (!canvas || !container || !nav) return
    const draw = () => {
      const bounds = container.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const rawPx = parseFloat(getComputedStyle(nav).getPropertyValue('--px'))
      const px = Number.isFinite(rawPx) && rawPx >= 2 ? Math.round(rawPx) : 3
      const w = Math.max(1, Math.ceil(bounds.width / px))
      const h = Math.max(18, Math.ceil(bounds.height / px))
      // Painted at 2x detail; the CSS size is unchanged.
      canvas.width = w * DETAIL
      canvas.height = h * DETAIL
      canvas.style.width = `${w * px}px`
      canvas.style.height = `${h * px}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.scale(DETAIL, DETAIL)
      drawPorchRoof(ctx, 0, w)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    const shell = nav.closest('.porch-shell')
    const styleObserver = shell ? new MutationObserver(draw) : null
    if (shell && styleObserver) styleObserver.observe(shell, { attributes: true, attributeFilter: ['style'] })
    draw()
    return () => {
      observer.disconnect()
      styleObserver?.disconnect()
    }
  }, [pathname])
  return <div className="porch-nav__roof" aria-hidden="true"><canvas ref={ref} className="porch-sprite" /></div>
}
function CompactRoof() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const container = canvas?.parentElement
    if (!canvas || !container) return
    const draw = () => {
      const bounds = container.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const w = Math.ceil(bounds.width / 2), h = Math.ceil(bounds.height / 2)
      canvas.width = w * DETAIL
      canvas.height = h * DETAIL
      canvas.style.width = `${w * 2}px`
      canvas.style.height = `${h * 2}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.scale(DETAIL, DETAIL)
      ctx.fillStyle = P.wood[1]
      ctx.fillRect(0, 0, w, h)
      drawPorchRoof(ctx, Math.max(0, h - 18), w)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    draw()
    return () => observer.disconnect()
  }, [])
  return <div className="porch-nav__compact-roof" aria-hidden="true"><canvas ref={ref} className="porch-sprite" /></div>
}
const lantern = defineSprite([
  '.......a.......', '......aba......', '.....ababa.....', '...j.abeba.j...', '..j.jafffa.jj..',
  '.j.j.abffba.j..', '..j..abgfba..j.', '.j.j.abffba.j..', '..j.jabffbaj...', '...j.abbba.j...',
  '.....aaaaa.....', '......aaa......',
], woodPalette)
/** The porch letterbox, at the nav's pixel scale (2x detail): flag up when signed out, down when signed in. */
function NavMailbox({ signedIn }: { signedIn: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(DETAIL, 0, 0, DETAIL, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, 28, 24)
    paintMailbox(ctx, { x: 0, y: 0, signedIn, shadow: false })
  }, [signedIn])
  return <canvas ref={ref} className="porch-sprite" width={28 * DETAIL} height={24 * DETAIL} style={{ width: 'calc(var(--px) * 28)', height: 'calc(var(--px) * 24)' }} aria-hidden="true" />
}

function SpriteImage({ sprite, className = '' }: { sprite: Sprite; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, sprite.w, sprite.h)
      drawSprite(ctx, sprite, 0, 0)
    }
  }, [sprite])
  return <canvas ref={ref} className={`porch-sprite ${className}`} width={sprite.w} height={sprite.h} style={{ width: `calc(var(--px) * ${sprite.w})`, height: `calc(var(--px) * ${sprite.h})` }} aria-hidden="true" />
}

/** Publishes the bar's live height as `--porch-nav-height` on the shell, so scene overlays can sit below it without measuring. */
function useNavHeightVar() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = ref.current
    const shell = nav?.closest<HTMLElement>('.porch-shell')
    const row = nav?.querySelector<HTMLElement>('.porch-nav__row')
    if (!nav || !shell || !row) return
    let last = ''
    let barHeight = 0
    // The phone menu drops below the bar. `--porch-nav-height` stays the bar's own height; `--porch-nav-bottom` is the lowest edge of
    // the bar or the open menu, so scene pages that sit under the bar (the gallery's header card) can step down clear of the menu.
    const publish = () => {
      const drawer = nav.querySelector('.porch-nav__mobile')?.getBoundingClientRect()
      if (!drawer) barHeight = Math.round(nav.getBoundingClientRect().height)
      const bar = barHeight || Math.round(row.getBoundingClientRect().height)
      const bottom = Math.round(drawer ? drawer.bottom : bar)
      const value = `${bar} ${bottom}`
      if (value === last) return
      last = value
      // On the shell, and on the document too: a floor pan carries `main` into an overlay outside the shell.
      for (const element of [shell, document.documentElement]) {
        element.style.setProperty('--porch-nav-height', `${bar}px`)
        element.style.setProperty('--porch-nav-bottom', `${bottom}px`)
      }
    }
    const observer = new ResizeObserver(publish)
    observer.observe(row)
    observer.observe(nav)
    publish()
    return () => {
      observer.disconnect()
      for (const element of [shell, document.documentElement]) { element.style.removeProperty('--porch-nav-height'); element.style.removeProperty('--porch-nav-bottom') }
    }
  }, [])
  return ref
}

const staticNavItems = nav.filter((item) => !item.devOnly && !item.roles)

export function StaticPorchNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useNavHeightVar()
  const navLink = (item: (typeof nav)[number]) => {
    const to = item.label === 'Gallery' ? '/home' : item.path
    const onClick = (event: MouseEvent<HTMLElement>) => {
      if (!isPrimaryClick(event)) return
      if (item.label === 'Party' && !window.dispatchEvent(new Event('porch-party-transition', { cancelable: true }))) { event.preventDefault(); return }
      if (item.label === 'Scores' && !window.dispatchEvent(new Event('porch-scores-transition', { cancelable: true }))) { event.preventDefault(); return }
    }
    return (
      <Link key={item.label} to={to} onClick={onClick} className="porch-nav__sign">
        <SpriteImage sprite={sign} />
        <span>{item.label}</span>
      </Link>
    )
  }
  return (
    <nav ref={navRef} data-testid="app-navigation" className="porch-nav">
      <PorchNavRoof pathname="/" />
      <div className="porch-nav__row">
        <Link to="/" aria-label="Pixle, home" className="porch-nav__logo"><SpriteImage sprite={logoSign} className="porch-nav__logo-full" /><SpriteImage sprite={compactLogoSign} className="porch-nav__logo-compact" /></Link>
        <div className="porch-nav__links">{staticNavItems.map(navLink)}</div>
        <div className="porch-nav__spacer" />
        <Link to="/home" data-testid="nav-sign-in-button" className="porch-nav__mail">
          <span className="porch-nav__mail-art"><NavMailbox signedIn={false} /></span>
          <span className="porch-nav__username">Sign in</span>
        </Link>
        <button type="button" className="porch-nav__toggle" onClick={() => setMobileMenuOpen((previous) => !previous)} aria-label="Toggle menu" aria-expanded={mobileMenuOpen}>
          {mobileMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
      </div>
      {mobileMenuOpen && <div className="porch-nav__mobile">{staticNavItems.map(navLink)}</div>}
    </nav>
  )
}

function navKindFor(item: (typeof nav)[number]): SceneNavKind {
  if (item.label === 'Party') return 'party'
  if (item.label === 'Scores') return 'scores'
  if (item.label === 'Gallery') return 'gallery'
  return 'porch'
}

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const { username } = useMyProfile()
  // The chosen Pixle name, falling back to the sign-in name only while it is
  // unknown or before the first username is set.
  const displayName = username || user?.name || user?.email || 'Signed in'
  // While a Daily attempt runs there is no way out of the easel: every exit is removed from the bar.
  const locked = useDailyLock()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useNavHeightVar()
  const navigate = useNavigate()
  // Sign-in is a form on a scene object (the mailbox on the porch, the ticket board below): the scene on screen takes the request.
  const openSignIn = () => { if (!requestSignIn()) navigate('/settings') }
  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'
  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    return !item.roles || (profileReady && (userRole === 'admin' || item.roles.includes(userRole as Role)))
  })
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  const galleryPath = user ? `/u/${encodeURIComponent(user.id)}` : '/u'
  const pathFor = (item: (typeof nav)[number]) => item.label === 'Gallery' ? galleryPath : item.path

  // Leaving /party, /r/:code, /scores or a gallery for the porch: flag it so the porch settles out of the matching object.
  // Already on the porch: tell it to cancel any pending zoom or zoom back out from Daily play/ended.
  const markPorchReturn = () => {
    if (location.pathname === '/home') window.dispatchEvent(new Event('pixel:return-porch'))
    else markPorchReturnFrom(location.pathname)
  }

  // One click handler for the nav signs, the mobile menu and the account dropdown so every
  // route in/out of any scene carries consistent physical transitions.
  const routeClick = (item: (typeof nav)[number], path: string, event: MouseEvent<HTMLElement>) => {
    const gallery = item.label === 'Gallery'
    if (gallery && !isSignedIn) { event.preventDefault(); setMobileMenuOpen(false); openSignIn(); return }
    if (!isPrimaryClick(event)) return
    const kind = navKindFor(item)
    setMobileMenuOpen(false)
    if (dispatchSceneNavigation(kind, path)) { event.preventDefault(); return }
    if (item.label === 'Party' && !window.dispatchEvent(new Event('porch-party-transition', { cancelable: true }))) { event.preventDefault(); return }
    if (item.label === 'Scores' && !window.dispatchEvent(new Event('porch-scores-transition', { cancelable: true }))) { event.preventDefault(); return }
    if (gallery && !window.dispatchEvent(new CustomEvent('porch-gallery-transition', { cancelable: true, detail: path }))) { event.preventDefault(); return }
    if (item.label === 'Daily') markPorchReturn()
  }

  const navLink = (item: (typeof nav)[number]) => {
    const gallery = item.label === 'Gallery'
    const path = gallery && user ? galleryPath : item.path
    const active =
      location.pathname === item.path ||
      (item.label === 'Party' && location.pathname.startsWith('/r/')) ||
      (gallery && location.pathname.startsWith('/u/'))
    return <Link key={item.label} to={path} onClick={(event) => routeClick(item, path, event)} onMouseEnter={() => prefetchRoute(path)} onFocus={() => prefetchRoute(path)} aria-current={active ? 'page' : undefined} className="porch-nav__sign">
      <SpriteImage sprite={active ? activeSign : sign} /><span>{item.label}</span>{active && <SpriteImage sprite={lantern} className="porch-nav__lantern" />}
    </Link>
  }
  return <>
    <nav ref={navRef} data-testid="app-navigation" className="porch-nav">
      <PorchNavRoof pathname={location.pathname} />
      <CompactRoof />
      <div className="porch-nav__row">
        {locked ? (
          <span aria-label="Pixle" className="porch-nav__logo" data-testid="nav-logo-locked">
            <SpriteImage sprite={logoSign} className="porch-nav__logo-full" />
            <SpriteImage sprite={compactLogoSign} className="porch-nav__logo-compact" />
          </span>
        ) : (
        <Link
          to="/home"
          aria-label="Pixle, home"
          onClick={(event) => {
            if (!isPrimaryClick(event)) return
            if (dispatchSceneNavigation('porch', '/home')) { event.preventDefault(); return }
            markPorchReturn()
          }}
          onMouseEnter={() => prefetchRoute('/home')}
          onFocus={() => prefetchRoute('/home')}
          className="porch-nav__logo"
        >
          <SpriteImage sprite={logoSign} className="porch-nav__logo-full" />
          <SpriteImage sprite={compactLogoSign} className="porch-nav__logo-compact" />
        </Link>
        )}
        {!locked && <div className="porch-nav__links">{visibleNav.map(navLink)}</div>}
        <div className="porch-nav__spacer" />
        {locked || !isLoaded || !profileReady ? null : isSignedIn && user ? <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label={`${displayName}, your account`} title={displayName} className="porch-nav__mail"><span className="porch-nav__mail-art"><NavMailbox signedIn /></span><span data-testid="nav-user-name" className="porch-nav__username">{displayName}</span></button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel><div>{displayName}</div><div data-testid="nav-user-email" className="text-sm text-muted-foreground">{user.email}</div></DropdownMenuLabel>
            <DropdownMenuSeparator />
            {visibleNav.map(item => <DropdownMenuItem key={item.label} render={<Link to={pathFor(item)} onClick={(event) => routeClick(item, pathFor(item), event)} />}>{item.label}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={galleryPath} onClick={(event) => routeClick({ path: '/u', label: 'Gallery' }, galleryPath, event)} />}>My gallery</DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/settings" onClick={(event) => { if (isPrimaryClick(event) && dispatchSceneNavigation('settings', '/settings')) event.preventDefault() }} />}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : <button data-testid="nav-sign-in-button" onClick={openSignIn} className="porch-nav__mail"><span className="porch-nav__mail-art"><NavMailbox signedIn={false} /></span><span className="porch-nav__username">Sign in</span></button>}
        {!locked && <button className="porch-nav__toggle" onClick={() => setMobileMenuOpen((previous) => !previous)} aria-label="Toggle menu" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}</button>}
      </div>
      {!locked && mobileMenuOpen && <div className="porch-nav__mobile">{visibleNav.map(navLink)}</div>}
    </nav>
  </>
}
