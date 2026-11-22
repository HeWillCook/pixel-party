/**
 * The signed-out Daily: the same easel and palette as the real attempt, but entirely client-side. Cells live in
 * local state, the 5:00 clock is a local timer, and the sketch is mirrored to localStorage so it survives sign-in.
 * No server calls and no judging: Submit (or the clock hitting 0) opens the sign-in card instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { DailyTimer } from './DailyTimer'
import { Palette } from '../game/Palette'
import { PixelCanvas } from '../game/PixelCanvas'
import { ToolBar } from '../game/ToolBar'
import { PainterTray } from '../game/PainterTray'
import { PlayLayout } from '../play/PlayLayout'
import { HoverEasel } from '../play/HoverEasel'
import { SubmitConfirm } from '../play/SubmitConfirm'
import { PlayBackdrop } from '../play/PlayBackdrop'
import { SignInCard } from '../auth/SignInCard'
import { Button, Modal } from '../ui'
import { DAILY, MAX_COLOR } from '../../game/config'
import { loadGuestSketch, saveGuestSketch, utcDay } from '../../game/daily/guestSketch'
import { emptyHistory, record, redo, undo, type History } from '../../game/history'
import { DAILY_TOOLS, floodFill, pickAt, type Tool } from '../../game/tools'
import { useToolShortcuts } from '../../hooks/useToolShortcuts'

const GRID = 32
const NOTE = "Guest sketch: sign in to get Haiku's verdict"
// Today's prompt is server-only (never shipped to a signed-out client), so the guest board has none to show.
const PROMPT_HIDDEN = 'Revealed when you sign in'
const noop = () => {}

export function GuestDaily({ onExit, muted = false }: { onExit: () => void; muted?: boolean }) {
  const day = useMemo(() => utcDay(), [])
  // Resume today's saved sketch (and its original clock) if there is one; otherwise this press starts the guest clock.
  const initial = useMemo(() => loadGuestSketch(day) ?? { day, startedAt: Date.now(), cells: new Uint8Array(GRID * GRID) }, [day])
  const startedAt = initial.startedAt
  const [cells, setCells] = useState<Uint8Array>(initial.cells)
  const cellsRef = useRef(cells)
  const [history, setHistory] = useState<History>(() => emptyHistory())
  const historyRef = useRef(history)
  const strokeSnapshotRef = useRef<Uint8Array | null>(null)
  const strokeActiveRef = useRef(false)
  const [strokeActive, setStrokeActive] = useState(false)
  const [activeColor, setActiveColor] = useState(4)
  const [tool, setTool] = useState<Tool>('paint')
  const [now, setNow] = useState(() => Date.now())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

  const timeUp = now >= startedAt + DAILY.attemptMs
  const canDraw = !timeUp

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // The local clock hitting 0 asks for sign-in once.
  const timeUpAsked = useRef(false)
  useEffect(() => {
    if (!timeUp || timeUpAsked.current) return
    timeUpAsked.current = true
    setConfirmOpen(false)
    setSignInOpen(true)
  }, [timeUp])

  const persist = useCallback((next: Uint8Array) => {
    cellsRef.current = next
    setCells(next)
    saveGuestSketch({ day, startedAt, cells: next })
  }, [day, startedAt])

  // Write the clock down as soon as the view opens, so a redirect before the first stroke keeps it.
  useEffect(() => { saveGuestSketch({ day, startedAt, cells: cellsRef.current }) }, [day, startedAt])

  const pushHistory = (snapshot: Uint8Array) => {
    const next = record(historyRef.current, snapshot)
    historyRef.current = next
    setHistory(next)
  }

  const handleStrokeStart = useCallback(() => {
    if (!canDraw) return
    strokeSnapshotRef.current = new Uint8Array(cellsRef.current)
    strokeActiveRef.current = true
    setStrokeActive(true)
  }, [canDraw])

  const handleStrokeEnd = useCallback(() => {
    strokeSnapshotRef.current = null
    if (!strokeActiveRef.current) return
    strokeActiveRef.current = false
    setStrokeActive(false)
  }, [])

  const handlePlace = useCallback((x: number, y: number, color: number) => {
    if (!canDraw) return
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= GRID || y < 0 || y >= GRID) return
    if (!Number.isInteger(color) || color < 0 || color > MAX_COLOR) return
    const idx = y * GRID + x
    if (cellsRef.current[idx] === color) return
    if (strokeSnapshotRef.current) {
      pushHistory(strokeSnapshotRef.current)
      strokeSnapshotRef.current = null
    }
    const next = cellsRef.current.slice()
    next[idx] = color
    persist(next)
  }, [canDraw, persist])

  const handleFill = useCallback((x: number, y: number) => {
    if (!canDraw) return
    const next = floodFill(cellsRef.current, GRID, GRID, x, y, activeColor)
    if (next === cellsRef.current) return
    pushHistory(cellsRef.current)
    persist(next)
  }, [canDraw, activeColor, persist])

  const handlePick = useCallback((x: number, y: number) => {
    const picked = pickAt(cellsRef.current, GRID, x, y)
    if (picked.tool === 'erase') setTool('erase')
    else { setActiveColor(picked.color); setTool('paint') }
  }, [])

  const handleUndo = useCallback(() => {
    if (!canDraw || strokeActiveRef.current) return
    const result = undo(historyRef.current, cellsRef.current)
    if (!result) return
    historyRef.current = result.history
    setHistory(result.history)
    persist(result.cells)
  }, [canDraw, persist])

  const handleRedo = useCallback(() => {
    if (!canDraw || strokeActiveRef.current) return
    const result = redo(historyRef.current, cellsRef.current)
    if (!result) return
    historyRef.current = result.history
    setHistory(result.history)
    persist(result.cells)
  }, [canDraw, persist])

  useToolShortcuts({
    tools: DAILY_TOOLS,
    onSelect: setTool,
    onUndo: strokeActive ? undefined : handleUndo,
    onRedo: strokeActive ? undefined : handleRedo,
    enabled: canDraw,
  })

  // Board sizing: the same measure the signed-in view makes, minus the camera flight.
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [boardNode, setBoardNode] = useState<HTMLDivElement | null>(null)
  const attachBoard = useCallback((node: HTMLDivElement | null) => { boardRef.current = node; setBoardNode(node) }, [])
  const paletteRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [boardBox, setBoardBox] = useState(() => ({ width: 320, height: 600, mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false }))
  useEffect(() => {
    const board = boardNode
    if (!board) return
    const measure = () => {
      const mobile = window.innerWidth < 768
      const paletteHeight = paletteRef.current?.offsetHeight ?? 0
      const footerHeight = footerRef.current?.offsetHeight ?? 0
      const width = board.clientWidth
      const boardTop = board.getBoundingClientRect().top
      const height = mobile
        ? Math.max(200, window.innerHeight - boardTop - paletteHeight - footerHeight - 24)
        : Math.max(200, window.innerHeight - ((board.closest('.play-layout') ?? board) as HTMLElement).getBoundingClientRect().top - paletteHeight - 10)
      setBoardBox(prev => (prev.width === width && prev.height === height && prev.mobile === mobile ? prev : { width, height, mobile }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    const layout = board.closest('.play-layout')
    if (layout) observer.observe(layout)
    if (paletteRef.current) observer.observe(paletteRef.current)
    if (footerRef.current) observer.observe(footerRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [boardNode])

  const askSignIn = () => { setConfirmOpen(false); setSignInOpen(true) }
  const submitButton = (
    <Button
      type="button"
      variant="secondary"
      data-testid="guest-submit-button"
      onClick={() => setConfirmOpen(true)}
      className="pp-btn daily-plaque daily-plaque--submit gap-1.5 px-3 py-1.5 text-base uppercase tracking-wider"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      <span>Submit</span>
    </Button>
  )
  const note = <p data-testid="guest-note" className="pp-panel px-3 py-2 text-base">{NOTE}</p>
  const timer = <DailyTimer startedAt={startedAt} />

  return (
    <div data-testid="daily-page" className="daily-page daily-page--playing mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-1 py-1 md:px-5 md:py-1">
      <div data-testid="daily-guest" data-play-phase="active" className="daily-play">
        <PlayBackdrop
          hostRef={backdropRef}
          phase="active"
          onTransitionEnd={noop}
          boardKey={`${boardBox.width}x${boardBox.height}:${boardBox.mobile ? 1 : 0}`}
          soundOn={!muted}
          signedIn={false}
          easelState="cover"
        />
        <div className="play-controls">
          <div className="play-register" data-registered="">
            <PlayLayout
              variant="daily"
              prompt={
                <div className="play-prompt daily-clipboard__prompt">
                  <span className="play-prompt__heading">Free sketch</span>
                  <span data-testid="daily-prompt" className="pp-word text-xl uppercase tracking-wide text-[var(--sunset-1)] sm:text-2xl">{PROMPT_HIDDEN}</span>
                  {timer}
                </div>
              }
              timeline={null}
              exit={
                <Button type="button" variant="secondary" size="sm" data-testid="guest-porch-button" aria-label="Back to porch" onClick={onExit} className="daily-porch-sign">
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Porch</span>
                </Button>
              }
              mobileTop={
                <div className="daily-mobile-top">
                  <div className="daily-mobile-top__prompt">
                    <span className="daily-mobile-top__label">Prompt</span>
                    <span data-testid="daily-prompt" className="pp-word daily-mobile-top__word">{PROMPT_HIDDEN}</span>
                  </div>
                  <div className="daily-mobile-top__right">{timer}</div>
                </div>
              }
              canvas={
                <div ref={attachBoard} className="flex w-full min-w-0 justify-center">
                  <HoverEasel>
                    <PixelCanvas
                      width={GRID}
                      height={GRID}
                      availWidth={boardBox.mobile ? Math.max(32, boardBox.width + 6) : Math.max(32, boardBox.width - 56)}
                      availHeight={boardBox.mobile ? Math.max(32, boardBox.height) : Math.min(596, Math.max(32, boardBox.height - 50))}
                      cells={cells}
                      activeColor={activeColor}
                      tool={tool}
                      canDraw={canDraw}
                      onPlace={handlePlace}
                      onFill={handleFill}
                      onPick={handlePick}
                      onStrokeStart={handleStrokeStart}
                      onStrokeEnd={handleStrokeEnd}
                    />
                  </HoverEasel>
                </div>
              }
              score={<div className="daily-right-stage flex flex-col gap-3">{note}{submitButton}</div>}
              actions={null}
              bottom={
                <PainterTray
                  trayRef={paletteRef}
                  activeColor={activeColor}
                  tool={tool}
                  tools={
                    <ToolBar
                      tools={DAILY_TOOLS}
                      compactPick
                      active={tool}
                      onSelect={setTool}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      canUndo={!strokeActive && history.past.length > 0}
                      canRedo={!strokeActive && history.future.length > 0}
                      disabled={!canDraw}
                    />
                  }
                  palette={
                    <Palette
                      activeColor={activeColor}
                      onSelectColor={color => { setActiveColor(color); if (tool === 'erase' || tool === 'pick') setTool('paint') }}
                      disabled={!canDraw}
                    />
                  }
                />
              }
              mobileFooter={
                <div ref={footerRef} className="daily-mobile-footer">
                  <div className="daily-mobile-strip">
                    <button type="button" data-testid="guest-porch-button-mobile" onClick={onExit} className="pp-btn daily-mobile-strip__btn"><span>Porch</span></button>
                    <span className="daily-mobile-strip__auto">Guest sketch</span>
                    <button type="button" data-testid="guest-submit-button" onClick={() => setConfirmOpen(true)} className="pp-btn daily-mobile-strip__btn daily-mobile-strip__btn--submit"><span>Submit</span></button>
                  </div>
                </div>
              }
            />
          </div>
        </div>
        <SubmitConfirm open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={askSignIn} />
        <Modal open={signInOpen} onClose={() => setSignInOpen(false)} aria-label="Sign in to get Haiku's verdict" hideClose>
          <div data-testid="guest-sign-in">
            <p className="mb-2 text-base">{timeUp ? 'Time’s up! ' : ''}{NOTE}. Your sketch is saved.</p>
            <SignInCard onClose={() => setSignInOpen(false)} />
          </div>
        </Modal>
      </div>
    </div>
  )
}
