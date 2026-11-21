import { useCallback, useMemo, useRef, useState } from 'react'
import { useAuthProfileReady, useQuery } from 'deepspace'
import { OwnGalleryWall } from '../../components/gallery/OwnGalleryWall'
import { ChalkboardBoard } from '../../components/porch/ChalkboardBoard'
import { PorchWall } from '../../components/gallery/PorchWall'
import { PorchLabels } from '../../components/porch/PorchLabels'
import { usePorchCloseup } from '../../components/porch/usePorchCloseup'
import { useArrivalFlare } from '../../scene/useArrivalFlare'
import { MAX_COLOR } from '../../game/config'
import { decodeCells } from '../../game/grid'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { useDailySounds } from '../../components/daily/useDailySounds'
import { PixelScene } from '../../scene/PixelScene'
import { drawPorch } from '../../scene/porch/drawPorch'
import '../../components/scores/scores.css'

/** The Scores close-up: the camera is on the porch chalkboard, whose writing is the live Scores board (the porch's own, zoomed to full size). */
export default function ScoresPage() {
  const { state } = useDaily()
  const { user, isSignedIn } = useAuthProfileReady({ requireUser: false })
  const userId = user?.id ?? ''
  const { muted } = useDailySounds(state)
  const { records: todayDrawings } = useQuery<{ userId: string; cells: string; score?: number }>('dailyDrawings', {
    where: state.day && userId ? { day: state.day, userId } : { day: '__none__' },
  })
  const bestDrawingCells = useMemo(() => {
    const raw = todayDrawings[0]?.data.cells ?? state.bestCells ?? state.lastCells
    if (!raw) return undefined
    try {
      const parsed = decodeCells(raw, 1024)
      return parsed.every((c) => c <= MAX_COLOR) ? parsed : undefined
    } catch {
      return undefined
    }
  }, [todayDrawings, state.bestCells, state.lastCells])
  const easelState: 'signin' | 'finished' | 'cover' = !isSignedIn
    ? 'signin'
    : state.status === 'ended'
      ? 'finished'
      : 'cover'
  const easelBest = Math.max(state.best, todayDrawings[0]?.data.score ?? 0)

  const closeup = usePorchCloseup({ pose: 'scores', kind: 'scores' })
  const { backdropRef, leaving, startExit } = closeup
  // The chalkboard's thrusters flare as the camera settles on it.
  const flare = useArrivalFlare(closeup.arrived)
  const flareBoost = useRef(flare.boost)
  flareBoost.current = flare.boost

  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const width = backdropRef.current?.clientWidth ?? window.innerWidth
    const height = backdropRef.current?.clientHeight ?? window.innerHeight
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, {
      easelState,
      easelCells: easelState === 'finished' ? bestDrawingCells : undefined,
      bob: false,
      soundOn: !muted,
      signedIn: isSignedIn,
      roofTop,
      hideChalkboard: false,
      flare: { target: 'chalkboard', boost: flareBoost.current() },
    })
  }, [easelState, bestDrawingCells, isSignedIn, muted, backdropRef])

  const toPorch = () => startExit('rest', '/home')
  // The wall of the painter just picked is hung while the camera starts across the porch to it, so the paintings are there when it arrives.
  const [visiting, setVisiting] = useState('')
  const visit = (href: string) => { setVisiting(decodeURIComponent(href.split('/').pop() ?? '')); startExit('gallery', href) }

  return (
    <div
      data-phase={leaving ? 'leaving' : 'active'}
      className={['scores-page', leaving ? 'scores-page--leaving' : ''].filter(Boolean).join(' ')}
      data-testid="scores-page"
    >
      <div
        ref={backdropRef}
        className={leaving ? 'scores-backdrop' : 'scores-backdrop scores-backdrop--dismiss'}
        data-camera="chalkboard"
        data-phase={leaving ? 'leaving' : 'active'}
        data-testid="scene-dismiss"
        onClick={toPorch}
      >
        <PixelScene
          draw={draw}
          className="scores-backdrop__scene"
          camera={closeup.camera}
          zoomMs={closeup.zoomMs}
          instant={!leaving}
          paused={!leaving && !flare.running}
        >
          {visiting && visiting !== userId ? <OwnGalleryWall key={visiting} userId={visiting} now /> : userId ? <OwnGalleryWall userId={userId} /> : <PorchWall />}
          <PorchLabels
            easel={easelState}
            best={easelBest}
            board={<ChalkboardBoard live onPorch={toPorch} onSelectPainter={visit} />}
          />
        </PixelScene>
      </div>
    </div>
  )
}
