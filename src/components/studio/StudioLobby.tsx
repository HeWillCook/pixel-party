import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe, Hash, Lock, Plus, Sparkles, Users } from 'lucide-react'
import { Hotspot } from '../../scene/Hotspot'
import { PixelScene, SceneComposition } from '../../scene/PixelScene'
import { cameraForLocal, compositionFor, coverCamera, coverZoom, integerScale, rectToPercent, sceneSize, type Camera, type Rect } from '../../scene/camera'
import { drawStudio } from '../../scene/studio/drawStudio'
import { studioLayout } from '../../scene/studio/layout'
import { fitCloseupCamera } from '../../scene/porch/fitCamera'
import { SCENE_ZOOM_MS } from '../../scene/zoom'
import { Badge, Button, Input, Label } from '../ui'
import { MagicEasel } from './MagicEasel'
import { requestVerticalSceneTransition } from '../porch/VerticalSceneTransition'
import { settledNavHeight } from '../porch/navMetrics'
import {
  enableNavMotion,
  sceneMoving,
  SCENE_NAV_EVENT,
  type SceneNavKind,
} from '../porch/returnFlag'
import { SignInSlip } from '../auth/SignInSlip'
import type { RoomPhase, RoomSummary } from './StudioWorld'
import './studio.css'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * The studio's content spans scene columns 18-300. A stage that shows all of them (282 scene units, at the integer scale) is at the
 * identity camera, so the stair that hangs under the porch hatch lands on exactly the porch's column (same x, same width) through
 * the floor pan. Narrower stages zoom out to fit, with a little air round the content.
 */
const STUDIO_CONTENT_UNITS = 282
function studioFitZoom(composition: 'landscape' | 'portrait', stageWidth: number, scale: number): number {
  return composition === 'landscape' && stageWidth < STUDIO_CONTENT_UNITS * scale
    ? Math.max(0.45, Math.min(1, stageWidth / (298 * scale)))
    : 1
}

// Camera zoom duration for the studio's own small camera moves (the fitted rest pose).
const ZOOM_MS = 380

export type ConjureCodeResult =
  | { status: 'ok'; joinCode: string }
  | { status: 'not_found' }

/** A room open on the easel: the camera is on its board (or travelling to or from it). */
export interface StudioRoomView {
  code: string
  phase: RoomPhase
  /** Where the room's board settles, in page coordinates. Null until the room has laid itself out. */
  boardRect: Rect | null
  /** Headline facts the room reports for the easel's HUD and word line. */
  summary: RoomSummary | null
}

export interface StudioRoomItem {
  recordId: string
  name: string
  mode: 'coop' | 'team'
  /** Null on a private room you have not joined: the lobby lists it, but never hands out its code. */
  joinCode: string | null
  hostId: string
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
  playerCount: number
  visibility: 'public' | 'private'
}

export interface StudioLobbyProps {
  rooms: StudioRoomItem[]
  roomsLoading: boolean
  signedIn: boolean
  currentUserId?: string
  mutationsReady: boolean
  roomName: string
  visibility: 'public' | 'private'
  creating: boolean
  joinCodeInput: string
  joining: boolean
  onRoomNameChange: (value: string) => void
  onVisibilityChange: (value: 'public' | 'private') => void
  onCreateRoom: (e: FormEvent) => void
  onRequestSignIn: () => void
  /** DEV ONLY (__DEBUG_TOOLS__): creates a room with a generated name and walks into it. */
  onDebugRoom?: () => void
  /** The sign-in slip pinned to the room-tickets corkboard. */
  signInOpen: boolean
  onCloseSignIn: () => void
  onJoinCodeChange: (value: string) => void
  onConjureCode: (code: string) => Promise<ConjureCodeResult>
  renderPackUp: (room: StudioRoomItem) => ReactNode
  /** Set while a room is open: the scene stays mounted and the camera moves onto the easel. */
  room?: StudioRoomView | null
  /** Receives the stage element, so a room's foreground can register against the live camera. */
  stageRef?: { current: HTMLElement | null }
  /** The magic easel's board in scene units (re-measured when the stage changes), for registering a room's board. */
  onFocus?: (rect: Rect | null) => void
  /** The smallest board (px) a room must use so the scene covers the viewport once the camera is on it (null: no room open). */
  onMinBoard?: (px: number | null) => void
  /** How far the room must slide (px) to stay on the easel when the scene can only cover the screen by moving. */
  onRoomShift?: (shift: { x: number; y: number }) => void
}

type HatEffect = 'idle' | 'dropping' | 'sparkle' | 'smoke'

function CreateEaselForm({
  signedIn,
  mutationsReady,
  roomName,
  visibility,
  creating,
  onRoomNameChange,
  onVisibilityChange,
  onCreateRoom,
  onRequestSignIn,
  compact = false,
}: Pick<
  StudioLobbyProps,
  | 'signedIn'
  | 'mutationsReady'
  | 'roomName'
  | 'visibility'
  | 'creating'
  | 'onRoomNameChange'
  | 'onVisibilityChange'
  | 'onCreateRoom'
  | 'onRequestSignIn'
> & { compact?: boolean }) {
  return (
    <form
      data-testid="create-room-form"
      onSubmit={onCreateRoom}
      className={compact ? 'studio-order-form' : 'pp-panel studio-workbench-form'}
    >
      <div className="studio-order-form__head">
        <h2 className={compact ? 'studio-order-form__title' : 'studio-workbench-form__title'}>
          Set up an easel
        </h2>
        <Badge variant="secondary" className={compact ? 'studio-order-form__badge' : 'pp-chip text-sm uppercase'}>
          Co-op 32×32
        </Badge>
      </div>
      <p className="studio-order-form__modes" data-testid="more-modes-note">More modes to come later</p>

      <div className={compact ? 'studio-order-form__field' : 'space-y-0.5'}>
        <Label
          htmlFor={compact ? 'room-name-board' : 'room-name'}
          className={compact ? 'studio-order-form__label' : 'text-sm uppercase text-[var(--soft-text)]'}
        >
          Room Name
        </Label>
        <Input
          id={compact ? 'room-name-board' : 'room-name'}
          data-testid="create-room-name"
          placeholder="Name your room"
          maxLength={40}
          value={roomName}
          onChange={(e) => onRoomNameChange(e.target.value)}
          disabled={!mutationsReady || creating}
          className={compact ? 'studio-order-form__input' : 'h-8 text-base'}
        />
      </div>

      <div className={compact ? 'studio-order-form__field' : 'space-y-0.5'}>
        <Label className={compact ? 'studio-order-form__label' : 'text-sm uppercase text-[var(--soft-text)]'}>
          Visibility
        </Label>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            data-testid="visibility-public"
            disabled={!mutationsReady || creating}
            onClick={() => onVisibilityChange('public')}
            className={`${compact ? 'studio-order-form__vis' : 'flex items-center justify-center gap-1 border-2 px-2 py-1 text-base uppercase transition-colors'} ${
              visibility === 'public'
                ? 'border-[var(--sunset-1)] bg-secondary text-[var(--sunset-1)]'
                : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className={compact ? 'studio-order-form__icon shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden />
            <span>Public</span>
          </button>
          <button
            type="button"
            data-testid="visibility-private"
            disabled={!mutationsReady || creating}
            onClick={() => onVisibilityChange('private')}
            className={`${compact ? 'studio-order-form__vis' : 'flex items-center justify-center gap-1 border-2 px-2 py-1 text-base uppercase transition-colors'} ${
              visibility === 'private'
                ? 'border-[var(--sunset-1)] bg-secondary text-[var(--sunset-1)]'
                : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lock className={compact ? 'studio-order-form__icon shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden />
            <span>Private</span>
          </button>
        </div>
      </div>

      {signedIn && !roomName.trim() && (
        <p data-testid="create-room-hint" className={compact ? 'studio-order-form__hint' : 'text-sm text-[var(--soft-text)]'}>
          Name your room to conjure it
        </p>
      )}
      {signedIn ? (
        <Button
          type="submit"
          data-testid="create-room-submit"
          disabled={!mutationsReady || creating || !roomName.trim()}
          className={compact ? 'pp-btn studio-order-form__submit' : 'pp-btn h-9 w-full gap-1.5 text-base uppercase'}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {creating ? 'Conjuring…' : 'Conjure'}
        </Button>
      ) : (
        <Button
          type="button"
          data-testid="create-room-signin"
          onClick={onRequestSignIn}
          className={compact ? 'pp-btn studio-order-form__submit' : 'pp-btn h-9 w-full gap-1.5 text-base uppercase'}
        >
          Sign in to Host a Room
        </Button>
      )}
    </form>
  )
}

function JoinCodeForm({
  joinCodeInput,
  joining,
  hatEffect,
  hatError,
  onJoinCodeChange,
  onSubmitCode,
  workbench = false,
}: {
  joinCodeInput: string
  joining: boolean
  hatEffect: HatEffect
  hatError: string | null
  onJoinCodeChange: (value: string) => void
  onSubmitCode: (e: FormEvent) => void
  workbench?: boolean
}) {
  if (workbench) {
    return (
      <form
        data-testid="join-room-form"
        onSubmit={onSubmitCode}
        className="studio-hat-booth"
      >
        {/* Hat drop / sparkle / smoke stage positioned over the pixel top hat */}
        <div className="studio-hat-stage" aria-hidden="true">
          {hatEffect === 'dropping' && (
            <span data-testid="hat-dropping-ticket" className="studio-hat-ticket" />
          )}
          {(hatEffect === 'dropping' || hatEffect === 'sparkle') && (
            <span data-testid="hat-sparkles" className="studio-hat-sparkles">
              <span className="studio-hat-spark studio-hat-spark--1" />
              <span className="studio-hat-spark studio-hat-spark--2" />
              <span className="studio-hat-spark studio-hat-spark--3" />
            </span>
          )}
          {hatEffect === 'smoke' && (
            <span data-testid="hat-smoke" className="studio-hat-smoke">
              <span className="studio-smoke-puff studio-smoke-puff--1" />
              <span className="studio-smoke-puff studio-smoke-puff--2" />
            </span>
          )}
        </div>

        <div className="pp-panel studio-hat-card">
          <h3 className="studio-hat-card__title">Got a code?</h3>
          <div className="studio-hat-card__row">
            <div className="relative flex-1 min-w-0">
              <Hash
                className="pointer-events-none absolute left-1.5 top-1/2 studio-hat-card__hash -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                data-testid="join-code-input"
                placeholder="Enter 4-char code"
                maxLength={64}
                value={joinCodeInput}
                onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
                disabled={joining}
                className="studio-hat-card__input"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              data-testid="join-code-submit"
              disabled={joining || !joinCodeInput.trim()}
              className="pp-btn studio-hat-card__btn"
            >
              {joining ? 'Dropping…' : 'Drop it in'}
            </Button>
          </div>
          {hatError && (
            <p role="status" data-testid="hat-error" className="studio-hat-error">
              {hatError}
            </p>
          )}
        </div>
      </form>
    )
  }

  return (
    <form
      data-testid="join-room-form"
      onSubmit={onSubmitCode}
      className="pp-panel studio-booth-form"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="studio-booth-form__title">Got a code?</h3>
        {hatEffect === 'sparkle' && (
          <Sparkles className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
        )}
      </div>
      <div className="studio-booth-form__row">
        <div className="relative flex-1 min-w-0">
          <Hash
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            data-testid="join-code-input"
            placeholder="Enter 4-char code"
            maxLength={64}
            value={joinCodeInput}
            onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
            disabled={joining}
            className="h-8 pl-7 text-base uppercase"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          data-testid="join-code-submit"
          disabled={joining || !joinCodeInput.trim()}
          className="pp-btn h-8 shrink-0 px-3 text-base uppercase"
        >
          {joining ? 'Dropping…' : 'Drop it in'}
        </Button>
      </div>
      {hatError && (
        <p role="status" data-testid="hat-error" className="text-sm text-[var(--sunset-2)]">
          {hatError}
        </p>
      )}
    </form>
  )
}

/** One line under the name: mode, players, and whether the game is waiting in its lobby. */
function roomMeta(room: StudioRoomItem): string[] {
  const parts = ['Co-op']
  parts.push(`${room.playerCount} ${room.playerCount === 1 ? 'painter' : 'painters'}`)
  if (room.status === 'lobby') parts.push('waiting')
  return parts
}

function CorkboardTickets({
  rooms,
  roomsLoading,
  selectedCode,
  currentUserId,
  renderPackUp,
  onSelectRoom,
  mobile = false,
  strip = false,
  style,
}: {
  rooms: StudioRoomItem[]
  roomsLoading: boolean
  selectedCode: string | null
  currentUserId?: string
  renderPackUp: (room: StudioRoomItem) => ReactNode
  onSelectRoom: (room: StudioRoomItem) => void
  style?: CSSProperties
  mobile?: boolean
  strip?: boolean
}) {
  // The phone's ticket rail scrolls sideways: say so (a fade and chevron at the edge that still has tickets behind it).
  const rail = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const element = rail.current
    if (!strip || !element) return
    const update = () => setMore(element.scrollWidth - element.clientWidth - element.scrollLeft > 6)
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { element.removeEventListener('scroll', update); observer.disconnect() }
  }, [strip, rooms.length])

  const ticket = (room: StudioRoomItem) => {
    const locked = room.joinCode === null
    return (
      <div
        key={room.recordId}
        className={`studio-ticket ${selectedCode !== null && selectedCode === room.joinCode ? 'studio-ticket--selected' : ''}`}
      >
        <button
          type="button"
          data-testid={`room-card-${room.joinCode ?? room.recordId}`}
          data-locked={locked ? '1' : undefined}
          aria-label={locked ? `${room.name} (private) — enter its code to join` : `Join ${room.name}`}
          onClick={() => onSelectRoom(room)}
          className="studio-ticket__main"
        >
          <span className="truncate studio-ticket__name">{room.name}</span>
          <span className="studio-ticket__meta">
            <span className="inline-flex items-center gap-0.5">
              {locked && <Lock className="studio-ticket__user-icon shrink-0" aria-label="Private" />}
              {roomMeta(room).join(' · ')}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Users className="studio-ticket__user-icon shrink-0" aria-hidden />
              {room.playerCount}
            </span>
          </span>
        </button>
        {currentUserId === room.hostId && <div className="studio-pack-wrap">{renderPackUp(room)}</div>}
      </div>
    )
  }

  return (
    <div
      data-testid="games-list"
      style={style}
      className={`studio-corkboard ${mobile ? 'studio-corkboard--mobile' : ''} ${strip ? 'studio-corkboard--strip' : ''}`.trim()}
    >
      <div className="studio-corkboard__header">
        <h2 className="studio-corkboard__title">Open games</h2>
        <span className="studio-corkboard__count">{rooms.length}</span>
      </div>

      <div className="studio-corkboard__rail">
        <div ref={rail} className="studio-corkboard__tickets">
          {rooms.length === 0 ? (
            <p data-testid="games-empty" className="studio-corkboard__empty">
              {roomsLoading ? 'Looking around…' : 'No games right now — host one!'}
            </p>
          ) : (
            rooms.map(ticket)
          )}
        </div>
        {strip && more && <span data-testid="ticket-rail-more" className="studio-corkboard__more" aria-hidden="true">›</span>}
      </div>
    </div>
  )
}

function StudioObjects({
  props,
  selectedCode,
  easelSmoke,
  transformSeq,
  hatEffect,
  hatError,
  onSelectRoom,
  onJoinCodeChange,
  onSubmitCode,
  onUpstairs,
  onEnterRoom,
  onComposition,
  roomView,
}: {
  props: StudioLobbyProps
  selectedCode: string | null
  easelSmoke: string | null
  transformSeq: number
  hatEffect: HatEffect
  hatError: string | null
  onSelectRoom: (room: StudioRoomItem) => void
  onJoinCodeChange: (value: string) => void
  onSubmitCode: (e: FormEvent) => void
  onUpstairs: (event: MouseEvent) => void
  onEnterRoom: (path: string, event?: MouseEvent) => void
  onComposition: (c: 'landscape' | 'portrait') => void
  roomView?: { summary: RoomSummary | null }
}) {
  const composition = useContext(SceneComposition)
  useEffect(() => {
    onComposition(composition)
  }, [composition, onComposition])

  const rect = studioLayout[composition]
  const selectedRoom = selectedCode ? props.rooms.find((r) => r.joinCode === selectedCode) : undefined
  const fallbackRoom = selectedCode
    ? {
        name: selectedRoom?.name ?? `Room ${selectedCode}`,
        joinCode: selectedCode,
        playerCount: selectedRoom?.playerCount ?? 0,
        status: selectedRoom?.status ?? 'playing',
      }
    : null

  return (
    <>
      <Hotspot
        rect={rect.upstairs}
        label="Upstairs"
        href="/home"
        onClick={onUpstairs}
      ><span className="studio-upstairs-sign-copy">Upstairs</span></Hotspot>

      {composition === 'landscape' ? (
        <>
          <CorkboardTickets
            rooms={props.rooms}
            roomsLoading={props.roomsLoading}
            selectedCode={selectedCode}
            currentUserId={props.currentUserId}
            renderPackUp={props.renderPackUp}
            onSelectRoom={onSelectRoom}
            style={rectToPercent(rect.corkboard, composition)}
          />

          <div
            className="studio-booth-slot"
            style={rectToPercent(rect.joinBooth, composition)}
          >
            <JoinCodeForm
              joinCodeInput={props.joinCodeInput}
              joining={props.joining}
              hatEffect={hatEffect}
              hatError={hatError}
              onJoinCodeChange={onJoinCodeChange}
              onSubmitCode={onSubmitCode}
              workbench
            />
          </div>

          <div
            className="studio-workbench-slot"
            style={rectToPercent(rect.workbenchBoard, composition)}
          >
            <CreateEaselForm
              signedIn={props.signedIn}
              mutationsReady={props.mutationsReady}
              roomName={props.roomName}
              visibility={props.visibility}
              creating={props.creating}
              onRoomNameChange={props.onRoomNameChange}
              onVisibilityChange={props.onVisibilityChange}
              onCreateRoom={props.onCreateRoom}
              onRequestSignIn={props.onRequestSignIn}
              compact
            />
          </div>
        </>
      ) : (
        <CorkboardTickets
          rooms={props.rooms}
          roomsLoading={props.roomsLoading}
          selectedCode={selectedCode}
          currentUserId={props.currentUserId}
          renderPackUp={props.renderPackUp}
          onSelectRoom={onSelectRoom}
          strip
          style={rectToPercent(rect.corkboard, composition)}
        />
      )}

      {/* Signing in is a slip that slides out from behind the corkboard and lands exactly over the cards beside it (the camera
          moves onto the board while it is out). */}
      {!roomView && (
        <SignInSlip
          fill
          open={props.signInOpen}
          onClose={props.onCloseSignIn}
          style={{
            ...rectToPercent(rect.signIn, composition),
            ['--slip-hide' as string]: composition === 'landscape' ? 'translateX(-70%) scale(0.3)' : 'translateY(-60%) scale(0.3)',
            transformOrigin: composition === 'landscape' ? '0% 50%' : '50% 0%',
          }}
        />
      )}

      <div
        className="studio-magic-slot"
        style={rectToPercent(rect.magicEasel, composition)}
      >
        <MagicEasel
          selectedCode={selectedCode}
          fallbackRoom={fallbackRoom}
          smokeMessage={easelSmoke}
          transformSeq={transformSeq}
          onStepIn={onEnterRoom}
          roomView={roomView}
        />
      </div>
    </>
  )
}

export function StudioLobby(props: StudioLobbyProps) {
  const navigate = useNavigate()
  const { onRequestSignIn } = props
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [composition, setComposition] = useState<'landscape' | 'portrait'>(() =>
    typeof window !== 'undefined' ? compositionFor(window.innerWidth, window.innerHeight) : 'landscape',
  )
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [easelSmoke, setEaselSmoke] = useState<string | null>(null)
  const [transformSeq, setTransformSeq] = useState(0)
  const [hatEffect, setHatEffect] = useState<HatEffect>('idle')
  const [hatError, setHatError] = useState<string | null>(null)
  const [stageBox, setStageBox] = useState({ w: 0, h: 0, scale: 4 })
  // A locked game asks for its code instead of joining: the room itself never sends that code to us.
  const [lockedRoom, setLockedRoom] = useState<StudioRoomItem | null>(null)
  const [privateCode, setPrivateCode] = useState('')
  const [privateError, setPrivateError] = useState<string | null>(null)
  const [privateJoining, setPrivateJoining] = useState(false)
  // `measured`: stage size known (layout effect, before first paint). `armed`: the measured pose has painted,
  // so camera changes may animate from here on. Until then camera updates are applied without a transition.
  const [measured, setMeasured] = useState(false)
  const [armed, setArmed] = useState(false)
  const spatialExitStarted = useRef(false)
  const [focusLocal, setFocusLocal] = useState<Rect | null>(null)

  useIsomorphicLayoutEffect(() => {
    const world = root.current
    const stage = world?.querySelector('.studio-world__stage') as HTMLElement | null
    if (!stage || !world) return
    const sync = () => {
      const bounds = stage.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const comp = compositionFor(bounds.width, bounds.height)
      const scale = integerScale(bounds.width, bounds.height, comp)
      const size = sceneSize(comp)
      const fitZoom = studioFitZoom(comp, bounds.width, scale)
      const cropBottom = fitZoom < 1
        ? Math.max(0, bounds.height - size.h * scale * fitZoom)
        : Math.max(0, (size.h * scale - bounds.height) / 2)
      const plankH = scale * 7 * fitZoom
      const canvasBottom = size.h * scale * fitZoom
      // Keep floor planks aligned seam-for-seam below a fitted canvas (180 - 98 = 82, 82 % 7 = 5 scene px)
      const plankPhase = (canvasBottom - 5 * scale * fitZoom) % plankH
      world.style.setProperty('--px', `${scale}px`)
      stage.style.setProperty('--studio-crop-bottom', `${cropBottom}px`)
      stage.style.setProperty('--studio-plank-h', `${plankH.toFixed(2)}px`)
      stage.style.setProperty('--studio-plank-y', `${plankPhase.toFixed(2)}px`)
      setStageBox((cur) => cur.w === bounds.width && cur.h === bounds.height && cur.scale === scale
        ? cur
        : { w: bounds.width, h: bounds.height, scale })
      setMeasured(true)
    }
    sync()
    if (props.stageRef) props.stageRef.current = stage
    const observer = new ResizeObserver(sync)
    observer.observe(stage)
    return () => {
      observer.disconnect()
      if (props.stageRef) props.stageRef.current = null
    }
  }, [])

  // Once measured, let the (instant) arrival pose paint for a frame, then release into the rest pose so the
  // arrival settle runs from the fitted position instead of snapping from a 0x0 stage.
  useEffect(() => {
    if (!measured) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setArmed(true)
      })
    })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [measured])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (hatTimer.current) clearTimeout(hatTimer.current)
    }
  }, [])

  const goUpstairsTo = useCallback(
    (kind: Exclude<SceneNavKind, 'party'>, path: string) => {
      if (timer.current || spatialExitStarted.current) return
      enableNavMotion()
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        navigate(path)
        return
      }
      // A request made while another move is still in flight (the descent into the basement) is queued by the transition and replayed
      // when it lands; latching here would swallow that replay. The latch is only for an exit this call starts itself.
      if (!sceneMoving()) spatialExitStarted.current = true
      const handled = requestVerticalSceneTransition({
        source: 'studio',
        target: 'porch',
          direction: 'up',
        path: '/home',
        ...(kind === 'porch' ? {} : { followup: { kind, path } }),
      })
      if (!handled) navigate(path)
    },
    [navigate],
  )

  const goUpstairs = useCallback(
    (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return
      }
      event.preventDefault()
      goUpstairsTo('porch', '/home')
    },
    [goUpstairsTo],
  )

  // Stepping into a room is just a route change: the studio scene stays mounted and its camera pushes into the easel.
  const goRoom = useCallback(
    (path: string, event?: MouseEvent) => {
      if (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return
        }
        event.preventDefault()
      }
      if (timer.current) return
      enableNavMotion()
      navigate(path)
    },
    [navigate],
  )

  useEffect(() => {
      const onSceneNav = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: SceneNavKind; path: string }>).detail
      if (!detail || detail.kind === 'party') return
      event.preventDefault()
      if (detail.kind === 'signin') onRequestSignIn()
      else if (detail.kind === 'porch') goUpstairsTo('porch', detail.path)
      else if (detail.kind === 'scores') goUpstairsTo('scores', detail.path)
      else if (detail.kind === 'gallery') goUpstairsTo('gallery', detail.path)
      else if (detail.kind === 'settings') goUpstairsTo('settings', detail.path)
    }
    window.addEventListener(SCENE_NAV_EVENT, onSceneNav)
    return () => window.removeEventListener(SCENE_NAV_EVENT, onSceneNav)
  }, [goUpstairsTo, onRequestSignIn])

  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    drawStudio(ctx, frame)
  }, [])

  const jumpToForm = useCallback((testId: 'create-room-name' | 'join-code-input') => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
    if (!el) return
    el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    })
    el.focus({ preventScroll: true })
  }, [])

  // A public game (or one of yours) joins straight away. A locked one asks for its code first.
  const handleSelectRoom = useCallback(
    (room: StudioRoomItem) => {
      setHatError(null)
      setEaselSmoke(null)
      if (room.joinCode) {
        // Put the game on the easel first and walk in on the next frame: the camera measures the easel while its
        // preview is showing, so the board lands on the canvas square instead of the whole paper.
        const joinCode = room.joinCode
        setSelectedCode(joinCode)
        requestAnimationFrame(() => goRoom(`/r/${encodeURIComponent(joinCode)}`))
        return
      }
      if (!props.signedIn) {
        props.onRequestSignIn()
        return
      }
      setLockedRoom(room)
      setPrivateCode('')
      setPrivateError(null)
    },
    [goRoom, props],
  )

  const handlePrivateSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const trimmed = privateCode.trim().toUpperCase()
      if (!trimmed || privateJoining) return
      setPrivateJoining(true)
      setPrivateError(null)
      // The join action re-finds the room by code and checks access: the client never learns the answer.
      const result = await props.onConjureCode(trimmed)
      setPrivateJoining(false)
      if (result.status !== 'ok') {
        setPrivateError('That code does not open a game.')
        return
      }
      setLockedRoom(null)
      setSelectedCode(result.joinCode)
      requestAnimationFrame(() => goRoom(`/r/${encodeURIComponent(result.joinCode)}`))
    },
    [goRoom, privateCode, privateJoining, props],
  )

  const handleCodeSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = props.joinCodeInput.trim()
      if (!trimmed) return
      if (!/^[A-Za-z0-9]{4}$/.test(trimmed)) {
        // Say what is wrong with the code rather than pretending to look for an easel that cannot exist.
        setHatEffect('idle')
        setEaselSmoke(null)
        setHatError('Room codes are 4 letters')
        return
      }
      if (hatTimer.current) {
        clearTimeout(hatTimer.current)
        hatTimer.current = null
      }
      setHatError(null)
      setEaselSmoke(null)
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setHatEffect(reduced ? 'sparkle' : 'dropping')

      const result = await props.onConjureCode(trimmed)
      if (!reduced) {
        await new Promise((resolve) => setTimeout(resolve, 260))
      }
      if (result.status === 'not_found') {
        setHatEffect('smoke')
        setHatError('No easel by that name')
        setEaselSmoke('No easel by that name')
        setSelectedCode(null)
        hatTimer.current = setTimeout(() => setHatEffect('idle'), 1400)
        return
      }
      setHatEffect('sparkle')
      setSelectedCode(result.joinCode)
      setTransformSeq((seq) => seq + 1)
      hatTimer.current = setTimeout(() => setHatEffect('idle'), 900)
      if (composition === 'portrait') {
        root.current?.querySelector('.studio-world__stage')?.scrollIntoView({
          behavior: reduced ? 'auto' : 'smooth',
          block: 'start',
        })
      }
    },
    [composition, props],
  )

  const size = sceneSize(composition)
  const fitZoom = stageBox.w > 0 ? studioFitZoom(composition, stageBox.w, stageBox.scale) : 1
  const baseX = fitZoom < 1 ? (size.w * stageBox.scale * (1 - fitZoom)) / 2 : 0
  const baseY = fitZoom < 1 ? Math.max(0, (size.h * stageBox.scale - stageBox.h) / 2) : 0

  const restCamera = {
    x: baseX === 0 ? 0 : Number(baseX.toFixed(2)),
    y: baseY === 0 ? 0 : Number(baseY.toFixed(2)),
    zoom: fitZoom === 1 ? 1 : Number(fitZoom.toFixed(4)),
  }

  // A room open on the easel: the camera lands on the room's board, which sits where the magic easel's board is.
  const room = props.room ?? null
  const stageOrigin = useRef({ x: 0, y: 0 })
  useIsomorphicLayoutEffect(() => {
    const stage = root.current?.querySelector('.studio-world__stage')
    if (stage) {
      const bounds = stage.getBoundingClientRect()
      stageOrigin.current = { x: bounds.left, y: bounds.top }
    }
    if (!room) return
    const camera = root.current?.querySelector<HTMLElement>('.pixel-scene__camera')
    const target = root.current?.querySelector('.studio-magic-easel__board-wrap') ?? root.current?.querySelector('.studio-magic-easel__surface')
    if (!camera || !target || !camera.offsetWidth) return
    // The camera element's own pixels: undo whatever zoom it is at, so the rect is valid at any camera.
    const cameraBox = camera.getBoundingClientRect()
    const zoom = cameraBox.width / camera.offsetWidth || 1
    const box = target.getBoundingClientRect()
    setFocusLocal({ x: (box.left - cameraBox.left) / zoom, y: (box.top - cameraBox.top) / zoom, w: box.width / zoom, h: box.height / zoom })
  }, [room, stageBox.w, stageBox.h, stageBox.scale, composition])
  const { onFocus } = props
  useIsomorphicLayoutEffect(() => {
    onFocus?.(room && focusLocal ? { x: focusLocal.x / stageBox.scale, y: focusLocal.y / stageBox.scale, w: focusLocal.w / stageBox.scale, h: focusLocal.h / stageBox.scale } : null)
  }, [onFocus, room, focusLocal, stageBox.scale])
  // The camera keeps the scene covering the screen. When the easel cannot be centred under the room's board without
  // showing void at an edge, the room slides by the difference instead, so the board still sits exactly on the easel.
  const { onMinBoard, onRoomShift } = props
  const shiftRef = useRef({ x: 0, y: 0 })
  const boardTop = room?.boardRect?.y
  const boardCentre = room?.boardRect ? room.boardRect.x + room.boardRect.w / 2 : undefined
  useIsomorphicLayoutEffect(() => {
    const report = (px: number | null, shift: { x: number; y: number }) => {
      onMinBoard?.(px)
      if (shift.x !== shiftRef.current.x || shift.y !== shiftRef.current.y) {
        shiftRef.current = shift
        onRoomShift?.(shift)
      }
    }
    // Leaving keeps what the room was sized and slid to: resetting at the start of the exit re-sized the board (and un-slid the room) in one
    // frame while the camera pulled back. The room unmounts when the route lands, and that resets it.
    if (room?.phase === 'leaving') return
    if (!room || !room.boardRect || !focusLocal || !stageBox.w || !stageBox.h) { report(null, { x: 0, y: 0 }); return }
    const viewport = { w: stageBox.w, h: stageBox.h }
    // The room reports its board where it would sit without the slide (see `onRoomShift`), so none of this feeds back on itself.
    const natural = {
      x: room.boardRect.x - stageOrigin.current.x,
      y: room.boardRect.y - stageOrigin.current.y,
      w: room.boardRect.w,
      h: room.boardRect.h,
    }
    const exact = cameraForLocal(focusLocal, natural, viewport, composition)
    const cover = coverCamera(focusLocal, natural, viewport, composition)
    const wanted = Math.ceil(focusLocal.w * coverZoom(focusLocal, { ...natural, x: natural.x + natural.w / 2, w: 0 }, viewport, composition))
    report(wanted, { x: Math.round(cover.x - exact.x), y: Math.round(cover.y - exact.y) })
  }, [onMinBoard, onRoomShift, room?.phase, Boolean(room), focusLocal, boardTop, boardCentre, room?.boardRect?.w, stageBox.w, stageBox.h, composition])
  const roomCamera: Camera | null = room?.boardRect && focusLocal && stageBox.w && stageBox.h
    ? coverCamera(
        focusLocal,
        { x: room.boardRect.x - stageOrigin.current.x, y: room.boardRect.y - stageOrigin.current.y, w: room.boardRect.w, h: room.boardRect.h },
        { w: stageBox.w, h: stageBox.h },
        composition,
      )
    : null
  // Signing in moves the camera onto the room-tickets corkboard and the slip that comes out of it (like the mailbox on the porch).
  const signIn = !room && props.signInOpen && stageBox.w > 0 && stageBox.h > 0
  const slotRects = studioLayout[composition]
  const signInCamera = signIn
    ? fitCloseupCamera(
        { x: slotRects.corkboard.x - 2, y: Math.min(slotRects.corkboard.y, slotRects.signIn.y) - 2, w: slotRects.signIn.x + slotRects.signIn.w - slotRects.corkboard.x + 4, h: Math.max(slotRects.corkboard.y + slotRects.corkboard.h, slotRects.signIn.y + slotRects.signIn.h) - Math.min(slotRects.corkboard.y, slotRects.signIn.y) + 4 },
        { w: stageBox.w, h: stageBox.h },
        composition,
        settledNavHeight(),
      )
    : null
  const signInMoved = useRef(false)
  if (signIn) signInMoved.current = true
  const camera = room && room.phase !== 'leaving' && roomCamera ? roomCamera : signInCamera ?? restCamera
  // The easel shows the open room, so the surface under the registered board is that room's live preview.
  const easelCode = room ? room.code : selectedCode

  return (
    <div
      ref={root}
      data-testid="lobby-page"
      className={[
        'studio-world',
        room ? 'studio-world--room' : '',
        room && room.phase !== 'leaving' ? 'studio-world--room-open' : '',
      ].filter(Boolean).join(' ')}
      data-composition={composition}
      data-fitted={fitZoom < 1 ? '1' : undefined}
      data-measured={measured ? '1' : undefined}
    >
      <div className="studio-world__stage">
        <PixelScene
          draw={draw}
          className="studio-world__scene"
          camera={camera}
          zoomMs={room || signInMoved.current ? SCENE_ZOOM_MS : ZOOM_MS}
          instant={!armed || room?.phase === 'active'}
          syncScale
        >
          <div className="studio-objects" style={{ display: 'contents' }} inert={Boolean(room)}>
          <StudioObjects
            props={props}
            selectedCode={easelCode}
            easelSmoke={easelSmoke}
            transformSeq={transformSeq}
            hatEffect={hatEffect}
            hatError={hatError}
            onSelectRoom={handleSelectRoom}
            onJoinCodeChange={(v) => {
              setHatError(null)
              props.onJoinCodeChange(v)
            }}
            onSubmitCode={handleCodeSubmit}
            onUpstairs={goUpstairs}
            onEnterRoom={goRoom}
            onComposition={setComposition}
            roomView={room ? { summary: room.summary } : undefined}
          />
          </div>
        </PixelScene>

        <nav className="studio-dock" aria-label="Studio shortcuts" inert={Boolean(room)}>
          <a href="/home" onClick={goUpstairs}>Upstairs</a>
          <button type="button" onClick={() => jumpToForm('create-room-name')}>
            Set up easel
          </button>
          <button type="button" onClick={() => jumpToForm('join-code-input')}>
            Got a code?
          </button>
        </nav>
        {/* DEV ONLY (__DEBUG_TOOLS__) */}
        {__DEBUG_TOOLS__ && props.onDebugRoom && !room && (
          <button type="button" data-testid="temp-debug-room" className="pp-chip studio-debug-room" disabled={props.creating} onClick={props.onDebugRoom} title="Temporary testing button: create a room with a generated name and go in">
            Debug: new room
          </button>
        )}
      </div>

      {composition === 'portrait' && !room && (
        <div className="studio-mobile-shelf">
          <JoinCodeForm
            joinCodeInput={props.joinCodeInput}
            joining={props.joining}
            hatEffect={hatEffect}
            hatError={hatError}
            onJoinCodeChange={(v) => {
              setHatError(null)
              props.onJoinCodeChange(v)
            }}
            onSubmitCode={handleCodeSubmit}
          />
          <CreateEaselForm
            signedIn={props.signedIn}
            mutationsReady={props.mutationsReady}
            roomName={props.roomName}
            visibility={props.visibility}
            creating={props.creating}
            onRoomNameChange={props.onRoomNameChange}
            onVisibilityChange={props.onVisibilityChange}
            onCreateRoom={props.onCreateRoom}
            onRequestSignIn={props.onRequestSignIn}
          />
        </div>
      )}

      {lockedRoom && (
        <div className="studio-locked-backdrop" onClick={() => setLockedRoom(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="locked-game-title"
            data-testid="private-join-dialog"
            className="pp-wood-panel studio-locked"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handlePrivateSubmit}
          >
            <h2 id="locked-game-title" className="studio-locked__title">
              {lockedRoom.name}
            </h2>
            <p className="studio-locked__copy">This game is private. Enter its code to come in.</p>
            <input
              autoFocus
              data-testid="private-join-code"
              aria-label="Private game code"
              placeholder="4-char code"
              maxLength={64}
              value={privateCode}
              onChange={(event) => {
                setPrivateError(null)
                setPrivateCode(event.target.value.toUpperCase())
              }}
              className="studio-locked__input"
            />
            {privateError && (
              <p role="status" data-testid="private-join-error" className="studio-locked__error">
                {privateError}
              </p>
            )}
            <div className="studio-locked__actions">
              <button
                type="button"
                data-testid="private-join-cancel"
                className="pp-chip studio-locked__cancel"
                onClick={() => setLockedRoom(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="private-join-submit"
                disabled={privateJoining || !privateCode.trim()}
                className="pp-btn studio-locked__submit"
              >
                {privateJoining ? 'Knocking…' : 'Join'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
