import { useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { PixelScene, SceneComposition } from '../../scene/PixelScene'
import { Hotspot } from '../../scene/Hotspot'
import { drawPorch, type PorchOptions } from '../../scene/porch/drawPorch'
import { porchLayout } from '../../scene/porch/layout'
import { rectToPercent } from '../../scene/camera'
import { drawSea, drawSun, drawSunsetSky, mulberry32 } from '../../scene/procedural'
import { RulesNote } from './RulesNote'
import './porch.css'

export type PorchScore = { name: string; score: number }
export interface PorchSceneProps {
  easelState: PorchOptions['easelState']
  easelLabel: string
  signedIn: boolean
  galleryHref?: string
  topThree: PorchScore[]
  muted: boolean
  onEasel: () => void
  onAccount: () => void
  onToggleMute: () => void
  easelTestId?: string
  easelDisabled?: boolean
  landing?: boolean
  easelText?: ReactNode
  children?: ReactNode
}

function Objects({ moreOpen, setMoreOpen, onParty, ...props }: PorchSceneProps & { moreOpen: boolean; setMoreOpen: (open: boolean) => void; onParty: (event: MouseEvent) => void }) {
  const composition = useContext(SceneComposition)
  const rect = porchLayout[composition]
  const [rulesOpen, setRulesOpen] = useState(false)
  return <>
    <Hotspot rect={rect.easel} label={props.easelLabel} href={props.landing ? '/home' : undefined} onClick={props.landing ? undefined : props.onEasel} testId={props.easelTestId} disabled={props.easelDisabled}><span className="porch-easel-copy">{props.easelText}</span></Hotspot>
    <Hotspot rect={rect.chalkboard} label="Today's scores" href="/scores" />
    <div className="porch-scores" style={rectToPercent(rect.chalkboard, composition)}><strong>Today's top {composition === 'portrait' ? 'three' : 'five'}</strong>{props.topThree.length ? props.topThree.slice(0, composition === 'portrait' ? 3 : 5).map((score, index) => <div className="porch-score-row" key={index}><span>{index + 1}. {score.name}</span><span>{score.score}</span></div>) : <div>No scores yet</div>}{composition === 'landscape' && <div className="porch-score-more">See all scores</div>}</div>
    <Hotspot rect={rect.hatch} label="Party studio" href="/party" onClick={onParty} testId={props.landing ? 'landing-browse-lobby' : undefined} />
    {composition === 'landscape' && <Hotspot rect={rect.lighthouse} label="Public board" href="/r/play" />}
    <Hotspot rect={rect.mailbox} label={props.signedIn ? 'Account menu' : 'Sign in'} onClick={props.onAccount} />
    <Hotspot rect={rect.gallery} label="Your gallery" href={props.signedIn ? props.galleryHref : undefined} onClick={props.signedIn ? undefined : props.onAccount} />
    {composition === 'landscape' ? <>
      <Hotspot rect={rect.radio} label={props.muted ? 'Unmute sounds' : 'Mute sounds'} pressed={props.muted} onClick={props.onToggleMute} />
      <Hotspot rect={rect.note} label="Scoring rules" onClick={() => setRulesOpen(true)} />
    </> : <>
      <button type="button" className="porch-more-ticket" style={rectToPercent(rect.more, composition)} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>More</button>
      {moreOpen && <div className="porch-more-menu pp-panel" role="group" aria-label="More porch actions">
        <a href="/r/play">Public board</a>
        <button type="button" onClick={props.onToggleMute}>{props.muted ? 'Unmute sounds' : 'Mute sounds'}</button>
        <button type="button" onClick={() => { setMoreOpen(false); setRulesOpen(true) }}>Scoring rules</button>
        <button type="button" onClick={() => setMoreOpen(false)}>Close</button>
      </div>}
    </>}
    {rulesOpen && <RulesNote onClose={() => setRulesOpen(false)} />}
  </>
}

export function PorchScene(props: PorchSceneProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [panning, setPanning] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const goParty = useCallback(() => {
    if (timer.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { window.location.assign('/party'); return }
    setPanning(true)
    timer.current = setTimeout(() => window.location.assign('/party'), 500)
  }, [])
  useEffect(() => {
    const onNavigation = (event: Event) => { event.preventDefault(); goParty() }
    window.addEventListener('porch-party-transition', onNavigation)
    return () => { window.removeEventListener('porch-party-transition', onNavigation); if (timer.current) clearTimeout(timer.current) }
  }, [goParty])
  const onParty = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    goParty()
  }
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const height = root.current?.clientHeight ?? window.innerHeight
    const width = root.current?.clientWidth ?? window.innerWidth
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, { easelState: props.easelState, bob: true, soundOn: !props.muted, signedIn: props.signedIn, roofTop })
  }, [props.easelState, props.muted, props.signedIn])
  return <div ref={root} className={props.landing ? 'porch-world porch-world--landing' : 'porch-world'}>
    <PixelScene draw={draw} className="porch-world__scene" camera={{ x: 0, y: panning ? -(root.current?.clientHeight ?? 0) : 0, zoom: 1 }} zoomMs={500} syncScale><Objects {...props} moreOpen={moreOpen} setMoreOpen={setMoreOpen} onParty={onParty} /></PixelScene>
    <nav className="porch-dock" aria-label="Porch shortcuts">
      <a href="/scores"><span aria-hidden="true">★</span>Scores</a>
      {props.signedIn && props.galleryHref ? <a href={props.galleryHref}><span aria-hidden="true">▣</span>Gallery</a> : <button onClick={props.onAccount}><span aria-hidden="true">▣</span>Gallery</button>}
      <a href="/party" onClick={onParty}><span aria-hidden="true">♫</span>Party</a>
      <button onClick={props.onAccount}><span aria-hidden="true">✉</span>Account</button>
      <button aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><span aria-hidden="true">⋯</span>More</button>
    </nav>
    {props.children}
  </div>
}

export function NeutralPorchLoading() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const width = ctx.canvas.width, height = ctx.canvas.height, horizon = Math.floor(height * 0.55), sun = Math.floor(width * 0.72)
    drawSunsetSky(ctx, width, horizon, frame)
    drawSun(ctx, sun, horizon, 20, horizon)
    drawSea(ctx, width, horizon, height - horizon, sun, frame, mulberry32(394))
  }, [])
  return <div className="porch-world"><PixelScene draw={draw} className="porch-world__scene" syncScale /><div data-testid="daily-loading" role="status" className="porch-loading pp-panel">Setting up your easel…</div></div>
}
