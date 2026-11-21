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
const logoPalette = { ...woodPalette, k: P.flame[2], l: P.sun[3], m: P.sea[2], n: P.sky[3], o: P.sun[4] }
const logoSign = (() => {
  const width = 70, height = 34
  const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'))
  const put = (x: number, y: number, color: string) => { if (x >= 0 && x < width && y >= 0 && y < height) pixels[y][x] = color }
  for (let y = 0; y < 8; y++) for (const x of [9, 10, 58, 59]) put(x, y, y % 2 ? 'h' : 'a')
  for (let y = 4; y < height; y++) for (let x = 1; x < width - 1; x++) {
    const inset = y < 10 ? Math.max(0, 8 - y + Math.floor(Math.abs(x - width / 2) / 13)) : y > 30 ? y - 30 : 0
    if (x < inset + 1 || x >= width - inset - 1) continue
    put(x, y, y === 4 || y === 33 || x === inset + 1 || x === width - inset - 2 ? 'a' : y === 5 ? 'f' : 'c')
  }
  const glyphs: Record<string, string[]> = {
    P: ['11110', '10001', '11110', '10000', '10000'], I: ['11111', '00100', '00100', '00100', '11111'],
    X: ['11011', '11011', '01110', '11011', '11011'], E: ['11111', '10000', '11110', '10000', '11111'],
    L: ['10000', '10000', '10000', '10000', '11111'], A: ['01110', '10001', '11111', '10001', '10001'],
    R: ['11110', '10001', '11110', '10010', '10001'], T: ['11111', '00100', '00100', '00100', '00100'],
    Y: ['11011', '11011', '01110', '00100', '00100'],
  }
  const lettering: { marks: [number, number][], color: string }[] = []
  ;['PIXEL', 'PARTY'].forEach((word, row) => Array.from(word).forEach((letter, index) => {
    const x = 4 + index * 12, y = 7 + row * 12
    const marks: [number, number][] = []
    glyphs[letter].forEach((line, lineIndex) => Array.from(line).forEach((pixel, column) => {
      if (pixel === '1') for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) marks.push([x + column * 2 + dx, y + lineIndex * 2 + dy])
    }))
    lettering.push({ marks, color: row === 0 ? 'k' : 'l' })
  }))
  lettering.forEach(({ marks }) => marks.forEach(([px, py]) => put(px + 1, py + 1, 'b')))
  lettering.forEach(({ marks }) => marks.forEach(([px, py]) => { put(px - 1, py, 'a'); put(px + 1, py, 'a'); put(px, py - 1, 'a'); put(px, py + 1, 'a') }))
  lettering.forEach(({ marks, color }) => {
    marks.forEach(([px, py]) => put(px, py, color))
    if (marks[0]) put(marks[0][0], marks[0][1], 'o')
  })
  put(62, 27, 'm'); put(62, 28, 'm'); put(63, 29, 'm'); put(63, 30, 'm')
  for (let offset = 0; offset < 6; offset++) put(3 + offset, 31 - Math.floor(offset / 2), offset < 2 ? 'k' : 'h')
  return defineSprite(pixels.map(row => row.join('')), logoPalette)
})()
const compactLogoSign = (() => {
  const width = 43, height = 20
  const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'))
  const put = (x: number, y: number, color: string) => { if (x >= 0 && x < width && y >= 0 && y < height) pixels[y][x] = color }
  for (let y = 0; y < 3; y++) for (const x of [6, 7, 35, 36]) put(x, y, y % 2 ? 'h' : 'a')
  for (let y = 2; y < height; y++) for (let x = 1; x < width - 1; x++) {
    const inset = y < 4 ? 4 - y : y > 17 ? y - 17 : 0
    if (x < inset + 1 || x >= width - inset - 1) continue
    put(x, y, y === 2 || y === height - 1 || x === inset + 1 || x === width - inset - 2 ? 'a' : y === 3 ? 'f' : 'c')
  }
  const glyphs: Record<string, string[]> = {
    P: ['11110', '10001', '11110', '10000', '10000'], I: ['11111', '00100', '00100', '00100', '11111'],
    X: ['11011', '11011', '01110', '11011', '11011'], E: ['11111', '10000', '11110', '10000', '11111'],
    L: ['10000', '10000', '10000', '10000', '11111'], A: ['01110', '10001', '11111', '10001', '10001'],
    R: ['11110', '10001', '11110', '10010', '10001'], T: ['11111', '00100', '00100', '00100', '00100'],
    Y: ['11011', '11011', '01110', '00100', '00100'],
  }
  const lettering: { marks: [number, number][], color: string }[] = []
  ;['PIXEL', 'PARTY'].forEach((word, row) => Array.from(word).forEach((letter, index) => {
    const x = 4 + index * 7, y = 5 + row * 7
    const marks: [number, number][] = []
    glyphs[letter].forEach((line, lineIndex) => Array.from(line).forEach((pixel, column) => {
      if (pixel === '1') marks.push([x + column, y + lineIndex])
    }))
    lettering.push({ marks, color: row === 0 ? 'k' : 'l' })
  }))
  lettering.forEach(({ marks }) => marks.forEach(([px, py]) => put(px + 1, py + 1, 'b')))
  lettering.forEach(({ marks }) => marks.forEach(([px, py]) => { put(px - 1, py, 'a'); put(px + 1, py, 'a'); put(px, py - 1, 'a'); put(px, py + 1, 'a') }))
  lettering.forEach(({ marks, color }) => {
    marks.forEach(([px, py]) => put(px, py, color))
    if (marks[0]) put(marks[0][0], marks[0][1], 'o')
  })
  put(39, 15, 'm'); put(39, 16, 'm')
  put(3, 17, 'k'); put(4, 17, 'h')
  return defineSprite(pixels.map(row => row.join('')), logoPalette)
})()
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
      shell.style.setProperty('--porch-nav-height', `${bar}px`)
      shell.style.setProperty('--porch-nav-bottom', `${bottom}px`)
    }
    const observer = new ResizeObserver(publish)
    observer.observe(row)
    observer.observe(nav)
    publish()
    return () => { observer.disconnect(); shell.style.removeProperty('--porch-nav-height'); shell.style.removeProperty('--porch-nav-bottom') }
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
        <Link to="/" aria-label="Pixel Party, home" className="porch-nav__logo"><SpriteImage sprite={logoSign} className="porch-nav__logo-full" /><SpriteImage sprite={compactLogoSign} className="porch-nav__logo-compact" /></Link>
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
          <span aria-label="Pixel Party" className="porch-nav__logo" data-testid="nav-logo-locked">
            <SpriteImage sprite={logoSign} className="porch-nav__logo-full" />
            <SpriteImage sprite={compactLogoSign} className="porch-nav__logo-compact" />
          </span>
        ) : (
        <Link
          to="/home"
          aria-label="Pixel Party, home"
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
          <DropdownMenuTrigger render={<button aria-label={`${user.name || user.email}, your account`} title={user.name || user.email} className="porch-nav__mail"><span className="porch-nav__mail-art"><NavMailbox signedIn /></span><span data-testid="nav-user-name" className="porch-nav__username">{user.name || user.email}</span></button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel><div>{user.name || 'Signed in'}</div><div data-testid="nav-user-email" className="text-sm text-muted-foreground">{user.email}</div></DropdownMenuLabel>
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
