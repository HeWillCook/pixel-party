import { useCallback, useContext, useState, type ReactNode } from 'react'
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

function Objects(props: PorchSceneProps) {
  const composition = useContext(SceneComposition)
  const rect = porchLayout[composition]
  const [rulesOpen, setRulesOpen] = useState(false)
  return <>
    <Hotspot rect={rect.easel} label={props.easelLabel} href={props.landing ? '/home' : undefined} onClick={props.landing ? undefined : props.onEasel} testId={props.easelTestId} disabled={props.easelDisabled}><span className="porch-easel-copy">{props.easelText}</span></Hotspot>
    <Hotspot rect={rect.chalkboard} label="Today's scores" href="/scores" />
    <div className="porch-scores" style={rectToPercent(rect.chalkboard, composition)}><strong>Today's top three</strong>{props.topThree.length ? props.topThree.map((score, index) => <div key={index}>{index + 1}. {score.name} {score.score}</div>) : <div>No scores yet</div>}</div>
    <Hotspot rect={rect.steps} label="Party beach" href="/party" testId={props.landing ? 'landing-browse-lobby' : undefined} />
    <Hotspot rect={rect.lighthouse} label="Public board" href="/r/play" />
    <Hotspot rect={rect.mailbox} label={props.signedIn ? 'Account menu' : 'Sign in'} onClick={props.onAccount} />
    <Hotspot rect={rect.door} label={props.signedIn ? 'My gallery' : 'Sign in for gallery'} href={props.signedIn ? props.galleryHref : undefined} onClick={props.signedIn ? undefined : props.onAccount} />
    <Hotspot rect={rect.radio} label={props.muted ? 'Unmute sounds' : 'Mute sounds'} pressed={props.muted} onClick={props.onToggleMute} />
    <Hotspot rect={rect.note} label="Scoring rules" onClick={() => setRulesOpen(true)} />
    {rulesOpen && <RulesNote onClose={() => setRulesOpen(false)} />}
  </>
}

export function PorchScene(props: PorchSceneProps) {
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => drawPorch(ctx, frame, { easelState: props.easelState, bob: true, soundOn: !props.muted }), [props.easelState, props.muted])
  return <div className={props.landing ? 'porch-world porch-world--landing' : 'porch-world'}>
    <PixelScene draw={draw} className="porch-world__scene" syncScale><Objects {...props} /></PixelScene>
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
