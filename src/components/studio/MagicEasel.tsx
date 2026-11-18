import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Users } from 'lucide-react'
import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import { usePixelRoom } from '../../hooks/usePixelRoom'
import { drawSprite, type Sprite } from '../../scene/sprite'
import { studioSprites } from '../../scene/studio/sprites'
import { useSceneClock } from '../../scene/useSceneClock'

export interface MagicEaselRoomInfo {
  name: string
  joinCode: string
  playerCount: number
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
}

export interface MagicEaselProps {
  selectedCode: string | null
  fallbackRoom: MagicEaselRoomInfo | null
  smokeMessage: string | null
  transformSeq: number
}

interface MagicSparkSpec {
  id: number
  tone: 'gold' | 'sun' | 'teal' | 'pink'
  left: string
  top: string
  sx: number
  sy: number
  delayMs: number
}

const MAGIC_SPARKS: MagicSparkSpec[] = [
  { id: 1, tone: 'gold', left: '-4%', top: '8%', sx: 14, sy: 10, delayMs: 0 },
  { id: 2, tone: 'teal', left: '14%', top: '-2%', sx: 10, sy: 14, delayMs: 280 },
  { id: 3, tone: 'pink', left: '84%', top: '-1%', sx: -10, sy: 14, delayMs: 560 },
  { id: 4, tone: 'sun', left: '99%', top: '12%', sx: -14, sy: 9, delayMs: 140 },
  { id: 5, tone: 'teal', left: '-6%', top: '30%', sx: 16, sy: 4, delayMs: 700 },
  { id: 6, tone: 'gold', left: '101%', top: '34%', sx: -16, sy: 4, delayMs: 420 },
  { id: 7, tone: 'pink', left: '-5%', top: '54%', sx: 15, sy: -3, delayMs: 980 },
  { id: 8, tone: 'gold', left: '100%', top: '56%', sx: -15, sy: -3, delayMs: 840 },
  { id: 9, tone: 'sun', left: '-2%', top: '74%', sx: 13, sy: -8, delayMs: 320 },
  { id: 10, tone: 'teal', left: '98%', top: '76%', sx: -13, sy: -8, delayMs: 1120 },
  { id: 11, tone: 'pink', left: '10%', top: '86%', sx: 9, sy: -12, delayMs: 620 },
  { id: 12, tone: 'gold', left: '86%', top: '86%', sx: -9, sy: -12, delayMs: 1260 },
  { id: 13, tone: 'sun', left: '34%', top: '-4%', sx: 4, sy: 16, delayMs: 500 },
  { id: 14, tone: 'teal', left: '64%', top: '-4%', sx: -4, sy: 16, delayMs: 910 },
]

function maskWord(word?: string): string {
  const trimmed = word?.trim()
  if (!trimmed) return '_ _ _ _ _'
  return Array.from(trimmed, (ch) => (ch === ' ' ? '  ' : '_')).join(' ')
}

function roundStateLabel(state?: string): string {
  switch (state) {
    case 'playing':
      return 'Playing'
    case 'lobby':
      return 'In lobby'
    case 'intermission':
      return 'Between rounds'
    case 'paused':
      return 'Paused'
    default:
      return 'Ready'
  }
}

function ScenePixelSprite({ sprite, className = '' }: { sprite: Sprite; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, sprite.w, sprite.h)
    drawSprite(ctx, sprite, 0, 0)
  }, [sprite])

  return (
    <canvas
      ref={ref}
      width={sprite.w}
      height={sprite.h}
      className={`porch-sprite ${className}`.trim()}
      style={{
        width: `calc(var(--px) * ${sprite.w})`,
        height: `calc(var(--px) * ${sprite.h})`,
      }}
      aria-hidden="true"
    />
  )
}

function MagicBooster() {
  const frame = useSceneClock(8, false)
  const frames = studioSprites.magicBoosterFrames
  const sprite = frames[frame % frames.length]
  return <ScenePixelSprite sprite={sprite} className="studio-magic-easel__booster-sprite" />
}

function LiveBoardPreview({
  width,
  height,
  cells,
  snapshotLoaded,
  connectError,
}: {
  width: number
  height: number
  cells: Uint8Array
  snapshotLoaded: boolean
  connectError: string | null
}) {
  if (!snapshotLoaded) {
    return (
      <div
        data-testid="magic-easel-preview-pending"
        className="studio-magic-easel__board-placeholder"
      >
        {connectError === 'unauthorized' ? (
          <span>Private room — step in to view</span>
        ) : connectError === 'not_found' || connectError === 'closed' ? (
          <span>No easel by that name</span>
        ) : (
          <span>Tuning in…</span>
        )}
      </div>
    )
  }

  return (
    <svg
      role="img"
      data-testid="magic-easel-canvas"
      aria-label="Live room preview"
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      className="studio-magic-easel__svg pixelated"
    >
      {Array.from(cells, (color, index) => {
        const x = index % width
        const y = Math.floor(index / width)
        const fill = color === 0 ? EMPTY_CANVAS[(x + y) % 2] : (PALETTE[color] ?? EMPTY_CANVAS[(x + y) % 2])
        return <rect key={index} x={x} y={y} width="1" height="1" fill={fill} />
      })}
    </svg>
  )
}

export function MagicEasel({
  selectedCode,
  fallbackRoom,
  smokeMessage,
  transformSeq,
}: MagicEaselProps) {
  const navigate = useNavigate()
  const { state } = usePixelRoom(selectedCode ?? '', { spectator: true })
  const [transforming, setTransforming] = useState(false)
  const prevSeqRef = useRef<number>(transformSeq)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (transformSeq === 0 || transformSeq === prevSeqRef.current) return
    prevSeqRef.current = transformSeq
    if (!selectedCode) {
      setTransforming(false)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTransforming(true)
    timerRef.current = setTimeout(() => {
      setTransforming(false)
      timerRef.current = null
    }, reduced ? 220 : 900)
  }, [selectedCode, transformSeq])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const previewTitle = useMemo(() => {
    if (!selectedCode) return null
    if (selectedCode === 'play') return 'Public board'
    return fallbackRoom?.name ?? `Room ${selectedCode}`
  }, [fallbackRoom?.name, selectedCode])

  const painters = state.snapshotLoaded
    ? state.players
    : (fallbackRoom?.playerCount ?? 0)
  const roundLabel = roundStateLabel(state.round?.state ?? fallbackRoom?.status)
  const hiddenWord = maskWord(state.round?.word)

  const effectiveSmoke =
    smokeMessage ??
    (state.connectError === 'not_found' || state.connectError === 'closed'
      ? 'No easel by that name'
      : null)

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && selectedCode && !effectiveSmoke) {
      if (e.target instanceof HTMLElement && e.target.closest('a, button')) return
      e.preventDefault()
      navigate(`/r/${encodeURIComponent(selectedCode)}`)
    }
  }

  return (
    <div
      data-testid="magic-easel"
      data-easel-state={effectiveSmoke ? 'smoke' : selectedCode ? 'preview' : 'idle'}
      tabIndex={selectedCode && !effectiveSmoke ? 0 : -1}
      onKeyDown={handleKeyDown}
      className={`studio-magic-easel ${transforming ? 'studio-magic-easel--transforming' : ''}`}
    >
      <div className="studio-magic-easel__aura" aria-hidden="true" />

      <div className="studio-magic-easel__sparkles" aria-hidden="true">
        {MAGIC_SPARKS.map((spark) => (
          <svg
            key={spark.id}
            viewBox="0 0 5 5"
            shapeRendering="crispEdges"
            className={`studio-magic-spark studio-magic-spark--${spark.tone}`}
            style={{
              left: spark.left,
              top: spark.top,
              animationDelay: `${spark.delayMs}ms`,
              '--sx': `${spark.sx}`,
              '--sy': `${spark.sy}`,
            } as CSSProperties}
          >
            <path d="M2 0h1v2h2v1H3v2H2V3H0V2h2z" fill="currentColor" />
          </svg>
        ))}
      </div>

      <div className="studio-magic-easel__crest" aria-hidden="true">
        <ScenePixelSprite sprite={studioSprites.easelCrest} />
      </div>

      <div className="studio-magic-easel__frame">
        <span className="studio-magic-easel__corner studio-magic-easel__corner--tl" aria-hidden="true" />
        <span className="studio-magic-easel__corner studio-magic-easel__corner--tr" aria-hidden="true" />
        <span className="studio-magic-easel__corner studio-magic-easel__corner--bl" aria-hidden="true" />
        <span className="studio-magic-easel__corner studio-magic-easel__corner--br" aria-hidden="true" />

        <div className="studio-magic-easel__surface">
          {transforming && (
            <>
              <div data-testid="magic-easel-flash" className="studio-magic-easel__flash" aria-hidden="true" />
              <div className="studio-magic-easel__wipe" aria-hidden="true" />
            </>
          )}

          {effectiveSmoke ? (
            <div data-testid="magic-easel-smoke" role="status" className="studio-magic-easel__smoke">
              <div className="studio-magic-easel__smoke-clouds" aria-hidden="true">
                <span className="studio-easel-cloud studio-easel-cloud--1" />
                <span className="studio-easel-cloud studio-easel-cloud--2" />
                <span className="studio-easel-cloud studio-easel-cloud--3" />
              </div>
              <p className="studio-magic-easel__smoke-text">{effectiveSmoke}</p>
            </div>
          ) : selectedCode ? (
            <div data-testid="magic-easel-preview" className="studio-magic-easel__preview">
              <div className="studio-magic-easel__hud">
                <span className="studio-magic-easel__code">
                  {selectedCode === 'play' ? 'OPEN' : selectedCode}
                </span>
                <span data-testid="magic-easel-painters" className="studio-magic-easel__stat">
                  <Users className="studio-magic-easel__stat-icon" aria-hidden />
                  {painters} {painters === 1 ? 'painter' : 'painters'}
                </span>
                <span data-testid="magic-easel-state" className="studio-magic-easel__round">
                  {roundLabel}
                </span>
              </div>

              <div className="studio-magic-easel__board-wrap">
                <LiveBoardPreview
                  width={state.width}
                  height={state.height}
                  cells={state.cells}
                  snapshotLoaded={state.snapshotLoaded}
                  connectError={state.connectError}
                />
              </div>

              <div data-testid="magic-easel-word" className="studio-magic-easel__word" aria-label="Word hidden">
                {hiddenWord}
              </div>
            </div>
          ) : (
            <div data-testid="magic-easel-idle" className="studio-magic-easel__idle">
              <div className="studio-magic-easel__shimmer" aria-hidden="true" />
              <Sparkles className="studio-magic-easel__idle-icon" aria-hidden="true" />
              <p className="studio-magic-easel__idle-text">
                Select a ticket or drop in a code
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedCode && !effectiveSmoke && (
        <div className="studio-magic-easel__plaque">
          <span data-testid="magic-easel-room-name" className="truncate studio-magic-easel__title">
            {previewTitle}
          </span>
        </div>
      )}

      <div className="studio-magic-easel__tray">
        {selectedCode && !effectiveSmoke ? (
          <Link
            to={`/r/${encodeURIComponent(selectedCode)}`}
            data-testid="magic-easel-step-in"
            className="studio-magic-easel__stepin"
          >
            Step in
          </Link>
        ) : (
          <div className="studio-magic-easel__props" aria-hidden="true">
            <span className="studio-magic-easel__brush" />
            <span className="studio-magic-easel__tube" />
            <span className="studio-magic-easel__tube studio-magic-easel__tube--light" />
          </div>
        )}
      </div>

      <div className="studio-magic-easel__base" aria-hidden="true">
        <span className="studio-magic-easel__leg studio-magic-easel__leg--left" />
        <span className="studio-magic-easel__leg studio-magic-easel__leg--right" />
        <span className="studio-magic-easel__booster">
          <MagicBooster />
        </span>
        <span className="studio-magic-easel__booster">
          <MagicBooster />
        </span>
        <span className="studio-magic-easel__booster">
          <MagicBooster />
        </span>
      </div>
      <div className="studio-magic-easel__shadow" aria-hidden="true" />
    </div>
  )
}

