import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { Menu, X } from 'lucide-react'
import { APP_NAME } from '../constants'
import type { Role } from '../constants'
import { nav } from '../nav'
import { P } from '../scene/palette'
import { defineSprite, drawSprite, type Sprite } from '../scene/sprite'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui'

const woodPalette = { a: P.wood[0], b: P.wood[1], c: P.wood[2], d: P.wood[3], e: P.wood[4], f: P.sun[4], g: P.flame[1], h: P.paper[3], i: P.sea[1], j: P.sun[2] }
const beam = defineSprite(Array.from({ length: 12 }, (_, y) => Array.from({ length: 32 }, (_, x) => {
  if (y === 0 || y === 11) return 'a'
  if (y === 1 || y === 2) return 'e'
  if (y === 10) return 'b'
  if (x === 0 || (x === 16 && y > 6)) return 'b'
  if ((y === 4 && x > 4 && x < 13) || (y === 7 && x > 19 && x < 28) || (y === 8 && x > 7 && x < 11)) return 'b'
  return y < 6 ? 'c' : 'd'
}).join('')), woodPalette)

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
const logoSign = plank(51)
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
    if (ctx) drawSprite(ctx, sprite, 0, 0)
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
    return <Link key={item.label} to={path} onClick={gallery && !isSignedIn ? (event) => { event.preventDefault(); setShowAuthModal(true) } : undefined} aria-current={active ? 'page' : undefined} className="porch-nav__sign">
      <SpriteImage sprite={active ? activeSign : sign} /><span>{item.label}</span>{active && <SpriteImage sprite={lantern} className="porch-nav__lantern" />}
    </Link>
  }
  return <>
    <nav data-testid="app-navigation" className="porch-nav">
      <div className="porch-nav__beam" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <SpriteImage key={index} sprite={beam} />)}</div>
      <div className="porch-nav__row">
        <Link to="/home" className="porch-nav__logo"><SpriteImage sprite={logoSign} /><span>{APP_NAME}</span></Link>
        <div className="porch-nav__links">{visibleNav.map(navLink)}</div>
        <div className="porch-nav__spacer" />
        {!isLoaded || !profileReady ? null : isSignedIn && user ? <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label="Account menu" className="porch-nav__mail"><span className="porch-nav__mail-art"><SpriteImage sprite={mailbox} /><SpriteImage sprite={flagDown} className="porch-nav__flag" /></span><span data-testid="nav-user-name" className="porch-nav__username">{user.name || user.email}</span></button>} />
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
