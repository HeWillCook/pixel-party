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

const woodPalette = { a: P.wood[0], b: P.wood[1], c: P.wood[2], d: P.wood[3], e: P.wood[4], f: P.sun[4], g: P.flame[2] }
const beam = defineSprite([
  'aaaaaaaaaaaaaaaaaaaaaaaa', 'eeeeeeeeeeeeeeeeeeeeeeee', 'cccccccccccccccccccccccc',
  'cccbbbbcccccccccbbbbcccc', 'cccccccccccccccccccccccc', 'bbbbbbbbbbbbbbbbbbbbbbbb',
], woodPalette)
const sign = defineSprite(Array.from({ length: 14 }, (_, y) => Array.from({ length: 40 }, (_, x) => {
  if (y < 2) return x === 9 || x === 30 ? 'b' : '.'
  if (y === 2 || y === 13 || x === 0 || x === 39) return 'a'
  if (y === 3 || x === 38) return 'f'
  if ((y === 5 && x > 3 && x < 11) || (y === 11 && x > 26 && x < 35)) return 'c'
  return 'e'
}).join('')), woodPalette)
const lantern = defineSprite(['...aaa...', '..abbba..', '..aeeea..', 'gabfffbag', 'gabfgfbag', 'gabfffbag', '.abfffba.', '..abbba..', '..aaaaa..', '...aaa...'], woodPalette)
const mailbox = defineSprite(['....aaaaa.......', '..aabbbbbaa.....', '.abcccccccba....', '.abcccccccbag...', '.abcccecccbaee..', '.abcccccccba....', '.abcccccccba....', '.abbbbbbbbba....', '..aaaaaaaaa.....', '.....bb.........', '.....bb.........', '....aaaa........'], woodPalette)

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
      <SpriteImage sprite={sign} /><span>{item.label}</span>{active && <SpriteImage sprite={lantern} className="porch-nav__lantern" />}
    </Link>
  }
  return <>
    <nav data-testid="app-navigation" className="porch-nav">
      <div className="porch-nav__beam" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <SpriteImage key={index} sprite={beam} />)}</div>
      <div className="porch-nav__row">
        <Link to="/home" className="pp-logo porch-nav__logo">{APP_NAME}</Link>
        <div className="porch-nav__links">{visibleNav.map(navLink)}</div>
        <div className="porch-nav__spacer" />
        {!isLoaded || !profileReady ? null : isSignedIn && user ? <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label="Account menu" className="porch-nav__mail"><SpriteImage sprite={mailbox} /><span data-testid="nav-user-name" className="porch-nav__username">{user.name || user.email}</span></button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel><div>{user.name || 'Signed in'}</div><div data-testid="nav-user-email" className="text-sm text-muted-foreground">{user.email}</div></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={`/u/${encodeURIComponent(user.id)}`} />}>My gallery</DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/settings" />}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : <button data-testid="nav-sign-in-button" onClick={() => setShowAuthModal(true)} className="porch-nav__mail"><SpriteImage sprite={mailbox} /><span>Sign in</span></button>}
        <button className="porch-nav__toggle" onClick={() => setMobileMenuOpen((previous) => !previous)} aria-label="Toggle menu" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}</button>
      </div>
      {mobileMenuOpen && <div className="porch-nav__mobile">{visibleNav.map(navLink)}</div>}
    </nav>
    {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
  </>
}
