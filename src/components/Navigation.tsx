import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { Menu, X } from 'lucide-react'
import type { Role } from '../constants'
import { nav } from '../nav'
import { P } from '../scene/palette'
import { PixelScene } from '../scene/PixelScene'
import { drawPorchRoof } from '../scene/porch/drawPorch'
import { defineSprite, drawSprite, type Sprite } from '../scene/sprite'
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
const sign = plank(40)
const activeSign = plank(40, true)
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
function drawRoofStrip(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = P.wood[1]; ctx.fillRect(0, 0, width, height)
  const root = ctx.canvas.closest('.pixel-scene')
  const scale = ctx.canvas.getBoundingClientRect().width / width
  const roofTop = root && scale ? Math.max(0, Math.floor((height - root.getBoundingClientRect().height / scale) / 2)) : 0
  drawPorchRoof(ctx, roofTop)
}
const lantern = defineSprite([
  '.......a.......', '......aba......', '.....ababa.....', '...j.abeba.j...', '..j.jafffa.jj..',
  '.j.j.abffba.j..', '..j..abgfba..j.', '.j.j.abffba.j..', '..j.jabffbaj...', '...j.abbba.j...',
  '.....aaaaa.....', '......aaa......',
], woodPalette)
const mailbox = defineSprite([
  '.....aaaaaaaaa..........', '...aabbbbbbbbbaa........', '..abcccccccccccba.......', '.abcccccccccccccba......',
  '.abcccccccccccccba......', 'abcccccccccccccccba.....', 'abcccceeeccccccccba.....', 'abcccccccccccccccba.....',
  'abcccccccccccccccba.....', 'abcccccccccccccccba.....', 'abcccccccccccccccba.....', 'abcccccccccccccccba.....',
  'abbbbbbbbbbbbbbbbba.....', '.aaaaaaaaaaaaaaaaa......', '......abbbba............', '......abbbba............',
  '......abbbba............', '......abbbba............', '......abbbba............', '......abbbba............',
  '.....aabbbbaa...........', '....aaaaaaaaaa..........', '........................',
], woodPalette)
const flagUp = defineSprite(['ggggg', 'gffgg', 'ggggg', 'g....', 'g....', 'g....', 'g....'], woodPalette)
const flagDown = defineSprite(['.......', '.......', '.......', '.......', '.......', 'ggggggg', 'gggffgg'], woodPalette)

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

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'
  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    return !item.roles || (profileReady && (userRole === 'admin' || item.roles.includes(userRole as Role)))
  })
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  const navLink = (item: (typeof nav)[number]) => {
    const gallery = item.label === 'Gallery'
    const path = gallery && user ? `/u/${encodeURIComponent(user.id)}` : item.path
    const active = location.pathname === item.path || (gallery && location.pathname.startsWith('/u/'))
    return <Link key={item.label} to={path} onClick={(event) => {
      if (gallery && !isSignedIn) { event.preventDefault(); setMobileMenuOpen(false); setShowAuthModal(true); return }
      if (item.label === 'Party' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && !window.dispatchEvent(new Event('porch-party-transition', { cancelable: true }))) event.preventDefault()
    }} aria-current={active ? 'page' : undefined} className="porch-nav__sign">
      <SpriteImage sprite={active ? activeSign : sign} /><span>{item.label}</span>{active && <SpriteImage sprite={lantern} className="porch-nav__lantern" />}
    </Link>
  }
  return <>
    <nav data-testid="app-navigation" className="porch-nav">
      {location.pathname !== '/home' && <PixelScene draw={drawRoofStrip} className="porch-nav__roof" />}
      <div className="porch-nav__row">
        <Link to="/home" aria-label="Pixel Party, home" className="porch-nav__logo"><SpriteImage sprite={logoSign} /></Link>
        <div className="porch-nav__links">{visibleNav.map(navLink)}</div>
        <div className="porch-nav__spacer" />
        {!isLoaded || !profileReady ? null : isSignedIn && user ? <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label={`Account menu: ${user.name || user.email}`} title={user.name || user.email} className="porch-nav__mail"><span className="porch-nav__mail-art"><SpriteImage sprite={mailbox} /><SpriteImage sprite={flagDown} className="porch-nav__flag" /></span><span data-testid="nav-user-name" className="porch-nav__username">{user.name || user.email}</span></button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel><div>{user.name || 'Signed in'}</div><div data-testid="nav-user-email" className="text-sm text-muted-foreground">{user.email}</div></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={`/u/${encodeURIComponent(user.id)}`} />}>My gallery</DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/settings" />}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : <button data-testid="nav-sign-in-button" onClick={() => setShowAuthModal(true)} className="porch-nav__mail"><span className="porch-nav__mail-art"><SpriteImage sprite={mailbox} /><SpriteImage sprite={flagUp} className="porch-nav__flag" /></span><span className="porch-nav__username">Sign in</span></button>}
        <button className="porch-nav__toggle" onClick={() => setMobileMenuOpen((previous) => !previous)} aria-label="Toggle menu" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}</button>
      </div>
      {mobileMenuOpen && <div className="porch-nav__mobile">{visibleNav.map(navLink)}</div>}
    </nav>
    {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
  </>
}
