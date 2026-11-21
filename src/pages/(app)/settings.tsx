/**
 * The mailbox close-up. Entered from the porch by zooming into the mailbox; the letter rises during the last
 * ~30% of that zoom, and the whole move reverses on the way back out.
 *
 * Signed in, the letter is the account. Signed out, the letter is the SDK's sign-in form: this is where every
 * "sign in" on the porch lands (the nav's sign-in, a gallery you have no account for, the 404's nav).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, useAuth, useUser } from 'deepspace'
import { SignInCard } from '@/components/auth/SignInCard'
import { ArrowLeft } from 'lucide-react'
import { StudioSprite } from '@/components/play/StudioSprite'
import { PorchWall } from '@/components/gallery/PorchWall'
import { PorchLabels } from '@/components/porch/PorchLabels'
import { useDaily } from '@/hooks/DailyAttemptProvider'
import { useMute } from '@/hooks/useMute'
import {
  consumeSettingsArrival,
  consumeZoomHandoff,
  enableNavMotion,
  markSceneMove,
  peekZoomHandoff,
  queueSceneNavigation,
  SCENE_NAV_EVENT,
  setPorchChain,
  setZoomHandoff,
  type PorchChainDest,
  type SceneNavKind,
} from '@/components/porch/returnFlag'
import { Button } from '@/components/ui'
import { PixelScene } from '@/scene/PixelScene'
import { compositionFor, type Camera } from '@/scene/camera'
import { drawPorch } from '@/scene/porch/drawPorch'
import { MAILBOX_GAP, mailboxFraming } from '@/scene/porch/mailboxCamera'
import { P } from '@/scene/palette'
import { defineSprite } from '@/scene/sprite'
import { useContinuingZoom } from '@/scene/useContinuingZoom'
import { porchPose } from '@/scene/porch/poses'
import { REST_CAMERA, SCENE_ZOOM_CHAIN_MS, SCENE_ZOOM_HANDOFF_MS, SCENE_ZOOM_MS, zoomHandoffAt, type ZoomHandoff } from '@/scene/zoom'
import '@/components/settings/settings.css'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const stampPalette = {
  d: P.wood[0],
  w: P.wood[2],
  h: P.wood[4],
  p: P.paper[4],
  c: P.paper[3],
  r: P.flame[0],
  s: P.sea[2],
  y: P.sun[4],
  g: P.foliage[2],
}

const postageStamp = defineSprite(
  [
    '.d.d.d.d.d.d.d.',
    'dpppppppppppppd',
    '.pcssssssssssp.',
    'dpcsppppppssspd',
    '.pcspyyyypssspd',
    'dpcspyyyypssspd',
    '.pcsssssssssspd',
    'dpcggggggggggpd',
    '.pcccccccccccc.',
    'dpppppppppppppd',
    '.d.d.d.d.d.d.d.',
  ],
  stampPalette,
)

const waxSeal = defineSprite(
  [
    '..dddd..',
    '.drrrrd.',
    'drrryrrd',
    'drryyyrd',
    'drrryrrd',
    '.drrrrd.',
    '..dddd..',
  ],
  stampPalette,
)

export default function SettingsPage() {
  const { user } = useUser()
  const { isSignedIn } = useAuth()
  const { state: daily } = useDaily()
  // The same preference as the porch radio.
  const { muted, toggle: toggleMute } = useMute()
  const easelMode = !isSignedIn ? 'signin' : daily.status === 'ended' ? 'finished' : 'cover'
  const navigate = useNavigate()
  const backdropRef = useRef<HTMLDivElement>(null)
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [exiting, setExiting] = useState(false)
  // The camera the page is flying to while leaving (the porch, or straight to another close-up).
  const [exitCamera, setExitCamera] = useState<Camera | null>(null)
  // A mailbox zoom that was still running when the route changed; keep the same curve going.
  const [handoff] = useState<ZoomHandoff | null>(() => {
    if (typeof window === 'undefined') return null
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
    return peekZoomHandoff()
  })
  const [fromPorch] = useState(() => {
    const arrived = consumeSettingsArrival()
    if (!arrived) return false
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    return true
  })

  useEffect(() => { if (handoff) consumeZoomHandoff() }, [handoff])
  useEffect(() => () => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current)
  }, [])

  useIsomorphicLayoutEffect(() => {
    // The backdrop is `position: fixed; inset: 0`. Freeze its size for the life of the page and
    // only follow real window resizes: a scrollbar appearing when the letter grows changed the
    // client width mid-zoom and retargeted the camera (a one-frame jump).
    const measure = () => {
      const w = document.documentElement.clientWidth
      const h = document.documentElement.clientHeight
      if (!w || !h) return
      setViewport(current => current.w === w && current.h === h ? current : { w, h })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const framing = viewport.w && viewport.h ? mailboxFraming(viewport) : null
  // A hand-off carries the exact camera the porch aimed at; landing there keeps the two pages
  // pixel-identical even if this page's scrollbar changes its client box by a few pixels.
  const mailboxCamera: Camera = handoff?.to ?? framing?.camera ?? REST_CAMERA
  const mailboxRect = framing?.rect ?? null
  const mailboxRef = useRef<Camera>(mailboxCamera)
  mailboxRef.current = mailboxCamera
  const continuedCamera = useContinuingZoom(handoff, handoff?.from ?? REST_CAMERA, mailboxCamera)
  const activeCamera = continuedCamera ?? mailboxCamera
  const camera: Camera = exitCamera ?? activeCamera

  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const width = backdropRef.current?.clientWidth ?? window.innerWidth
    const height = backdropRef.current?.clientHeight ?? window.innerHeight
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, { easelState: easelMode, bob: false, soundOn: false, signedIn: Boolean(isSignedIn), roofTop, hideChalkboard: false })
  }, [isSignedIn, easelMode])

  // The letter slides back into the mailbox while the camera flies: to the porch, or straight to the next close-up.
  const startExit = useCallback((kind: SceneNavKind, path: string) => {
    if (zoomTimer.current) { queueSceneNavigation(path); return }
    enableNavMotion()
    markSceneMove()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const toPorch = kind === 'porch'
    if (reduced) {
      if (!toPorch && kind !== 'scores' && kind !== 'gallery') setPorchChain({ kind: kind as PorchChainDest['kind'], path })
      navigate(toPorch || kind === 'scores' || kind === 'gallery' ? path : '/home')
      return
    }
    const flight = kind === 'scores' || kind === 'gallery' ? kind : 'rest'
    const target = porchPose(flight, viewport, compositionFor(viewport.w || 1, viewport.h || 1), document.querySelector('[data-testid="app-navigation"]')?.getBoundingClientRect().height || 72)
    setExiting(true)
    setExitCamera(target)
    zoomTimer.current = setTimeout(() => {
      const cameraEl = backdropRef.current?.querySelector('.pixel-scene__camera') ?? null
      setZoomHandoff(zoomHandoffAt(cameraEl, mailboxRef.current, target, SCENE_ZOOM_MS))
      // A chained destination (the studio below) starts its floor pan from the porch while that zoom is still running.
      if (flight === 'rest' && !toPorch) { setPorchChain({ kind: kind as PorchChainDest['kind'], path }); navigate('/home'); return }
      navigate(path)
    }, flight === 'rest' && !toPorch ? SCENE_ZOOM_CHAIN_MS : SCENE_ZOOM_HANDOFF_MS)
  }, [navigate, viewport])

  useEffect(() => {
    const onSceneNav = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: SceneNavKind; path: string }>).detail
      if (!detail) return
      event.preventDefault()
      // Already at the mailbox: settings and sign-in are this very page.
      if (detail.kind === 'settings' || detail.kind === 'signin') return
      startExit(detail.kind, detail.path)
    }
    window.addEventListener(SCENE_NAV_EVENT, onSceneNav)
    return () => window.removeEventListener(SCENE_NAV_EVENT, onSceneNav)
  }, [startExit])

  // Escape puts the letter away: the reverse of the zoom that brought you here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') startExit('porch', '/home') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startExit])

  const onPorchLink = useCallback((event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    startExit('porch', '/home')
  }, [startExit])

  const pageClass = [
    'settings-page',
    fromPorch || handoff ? 'settings-page--arriving' : '',
    exiting ? 'settings-page--leaving' : '',
  ].filter(Boolean).join(' ')

  const pageStyle = framing
    ? ({
        '--settings-mailbox-space': `${Math.round(framing.rect.x + framing.rect.w + MAILBOX_GAP)}px`,
        '--settings-mailbox-top': `${Math.round(framing.rect.y)}px`,
        '--settings-mailbox-reserve': `${Math.round(window.innerHeight - framing.rect.y + MAILBOX_GAP)}px`,
      } as CSSProperties)
    : undefined

  return (
    <div
      className={pageClass}
      style={pageStyle}
      data-testid="settings-page"
      data-phase={exiting ? 'leaving' : 'active'}
    >
      <div
        ref={backdropRef}
        className={exiting ? 'settings-backdrop' : 'settings-backdrop settings-backdrop--dismiss'}
        data-testid="scene-dismiss"
        onClick={() => startExit('porch', '/home')}
      >
        <PixelScene
          draw={draw}
          className="settings-backdrop__scene"
          camera={camera}
          zoomMs={exitCamera ? SCENE_ZOOM_MS : 0}
          instant={!exitCamera}
          paused={!exitCamera}
        >
          <PorchWall />
          <PorchLabels easel={easelMode} best={daily.best} />
        </PixelScene>
      </div>

      <div className={`settings-stage settings-stage--${framing?.mode ?? 'side'}`}>
        <div className="settings-gutter" aria-hidden="true" />
        <div className="settings-column">
          <div className="settings-head mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="pp-chip pp-word inline-flex items-center px-3 py-1 text-3xl uppercase">{isSignedIn ? 'Settings' : 'Sign in'}</h1>
            <Link
              to="/home"
              onClick={onPorchLink}
              className="pp-chip inline-flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 text-base uppercase tracking-wider hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to porch
            </Link>
          </div>

          <article
            data-testid="settings-letter"
            className="pp-panel relative overflow-hidden p-0"
          >
            <div
              aria-hidden="true"
              className="h-2.5 w-full border-b-2 border-[#8e5960]"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${P.flame[0]} 0 14px, ${P.paper[4]} 14px 20px, ${P.sea[1]} 20px 34px, ${P.paper[4]} 34px 40px)`,
              }}
            />

            <div className="settings-letter__body p-6 sm:p-8">
              <header className="settings-letter__head flex items-start justify-between gap-4 border-b-2 border-dashed border-[#d1b5a3] pb-4">
                <div className="min-w-0">
                  <p className="text-[15px] uppercase tracking-widest text-[var(--soft-text)]">
                    From the porch mailbox
                  </p>
                  <h2 className="mt-1 text-3xl uppercase text-[var(--sunset-2)]">{isSignedIn ? 'Your account' : 'Post for you'}</h2>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="pp-chip hidden px-2.5 py-1 text-[15px] uppercase tracking-wider sm:inline-block">
                    Porch Post
                  </span>
                  <div className="border-2 border-[#8e5960] bg-[#fff0cc] p-1">
                    <StudioSprite sprite={postageStamp} scale={3} />
                  </div>
                </div>
              </header>

              {isSignedIn ? <>
                <dl className="settings-letter__fields mt-5 space-y-4 text-lg">
                  <div className="border-b-2 border-[#d1b5a3] pb-2">
                    <dt className="text-[15px] uppercase tracking-wider text-muted-foreground">Name</dt>
                    <dd className="mt-0.5 text-2xl text-foreground">{user?.name || '—'}</dd>
                  </div>
                  <div className="border-b-2 border-[#d1b5a3] pb-2">
                    <dt className="text-[15px] uppercase tracking-wider text-muted-foreground">Email</dt>
                    <dd className="mt-0.5 break-all text-2xl text-foreground">{user?.email || '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b-2 border-[#d1b5a3] pb-3">
                    <dt id="settings-sound-label" className="text-[15px] uppercase tracking-wider text-muted-foreground">Sound</dt>
                    <dd>
                      <button type="button" role="switch" aria-checked={!muted} aria-labelledby="settings-sound-label" data-testid="settings-sound" className="pp-btn min-h-[44px] min-w-[88px] px-4 text-lg uppercase" onClick={toggleMute}>
                        {muted ? 'Off' : 'On'}
                      </button>
                    </dd>
                  </div>
                </dl>
  
                <footer className="settings-letter__footer mt-7 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 text-[17px] text-[var(--soft-text)]">
                    <StudioSprite sprite={waxSeal} scale={3} />
                    <span>Stamped on the sunset porch</span>
                  </div>
  
                  <Button variant="secondary" className="pp-btn px-5 text-lg uppercase" onClick={() => signOut()}>
                    Sign out
                  </Button>
                </footer>
              </> : <div className="mt-5"><SignInCard onClose={() => startExit('porch', '/home')} /></div>}
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
