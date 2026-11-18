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
import type { ConjureCodeResult } from '../../pages/(app)/party'
import { Hotspot } from '../../scene/Hotspot'
import { PixelScene, SceneComposition } from '../../scene/PixelScene'
import { compositionFor, integerScale, rectToPercent, sceneSize } from '../../scene/camera'
import { drawStudio } from '../../scene/studio/drawStudio'
import { studioLayout } from '../../scene/studio/layout'
import { Badge, Button, Input, Label } from '../ui'
import './studio.css'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface StudioRoomItem {
  recordId: string
  name: string
  joinCode: string
  hostId: string
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
  playerCount: number
}

export interface StudioLobbyProps {
  rooms: StudioRoomItem[]
  roomsLoading: boolean
  defaultBoardPlayers: number
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
  onJoinCodeChange: (value: string) => void
  onConjureCode: (code: string) => Promise<ConjureCodeResult>
  renderPackUp: (room: StudioRoomItem) => ReactNode
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
          placeholder="e.g. Midnight Pixel Club"
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

function CorkboardTickets({
  rooms,
  roomsLoading,
  defaultBoardPlayers,
  selectedCode,
  currentUserId,
  renderPackUp,
  onSelectTicket,
  mobile = false,
  style,
}: {
  rooms: StudioRoomItem[]
  roomsLoading: boolean
  defaultBoardPlayers: number
  selectedCode: string | null
  currentUserId?: string
  renderPackUp: (room: StudioRoomItem) => ReactNode
  onSelectTicket: (code: string) => void
  mobile?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      data-testid="public-rooms-list"
      style={style}
      className={`studio-corkboard ${mobile ? 'studio-corkboard--mobile' : ''}`}
    >
      <div className="studio-corkboard__header">
        <h2 className="studio-corkboard__title">Room tickets</h2>
        <span className="studio-corkboard__count">{rooms.length + 1}</span>
      </div>

      <div className="studio-corkboard__tickets">
        {/* Gold Public board ticket pinned first */}
        <div
          className={`studio-ticket studio-ticket--gold ${
            selectedCode === 'play' ? 'studio-ticket--selected' : ''
          }`}
        >
          <button
            type="button"
            data-testid="room-card-play"
            aria-pressed={selectedCode === 'play'}
            onClick={() => onSelectTicket('play')}
            className="studio-ticket__main"
          >
            <span className="truncate studio-ticket__name">Public board</span>
            <span className="studio-ticket__meta">
              <span>OPEN</span>
              <span className="inline-flex items-center gap-0.5">
                <Users className="studio-ticket__user-icon shrink-0" aria-hidden />
                {defaultBoardPlayers}
              </span>
            </span>
          </button>
          <Link
            to="/r/play"
            data-testid="lobby-play-now"
            aria-label="Play Public board now"
            className="studio-ticket__go"
          >
            Play
          </Link>
        </div>

        {rooms.length === 0 ? (
          <p className="studio-corkboard__empty">
            {roomsLoading ? 'Looking around…' : 'No custom tickets yet'}
          </p>
        ) : (
          rooms.map((room) => (
            <div
              key={room.recordId}
              className={`studio-ticket ${
                selectedCode === room.joinCode ? 'studio-ticket--selected' : ''
              }`}
            >
              <button
                type="button"
                data-testid={`room-card-${room.joinCode}`}
                aria-pressed={selectedCode === room.joinCode}
                onClick={() => onSelectTicket(room.joinCode)}
                className="studio-ticket__main"
              >
                <span className="truncate studio-ticket__name">{room.name}</span>
                <span className="studio-ticket__meta">
                  <span>{room.joinCode}</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Users className="studio-ticket__user-icon shrink-0" aria-hidden />
                    {room.playerCount}
                  </span>
                </span>
              </button>
              {currentUserId === room.hostId && (
                <div className="studio-pack-wrap">{renderPackUp(room)}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StudioObjects({
  props,
  selectedCode,
  hatEffect,
  hatError,
  onSelectTicket,
  onJoinCodeChange,
  onSubmitCode,
  onUpstairs,
  onComposition,
}: {
  props: StudioLobbyProps
  selectedCode: string | null
  hatEffect: HatEffect
  hatError: string | null
  onSelectTicket: (code: string) => void
  onJoinCodeChange: (value: string) => void
  onSubmitCode: (e: FormEvent) => void
  onUpstairs: (event: MouseEvent) => void
  onComposition: (c: 'landscape' | 'portrait') => void
}) {
  const composition = useContext(SceneComposition)
  useEffect(() => {
    onComposition(composition)
  }, [composition, onComposition])

  const rect = studioLayout[composition]
  const selectedRoom = selectedCode
    ? selectedCode === 'play'
      ? { name: 'Public board', joinCode: 'play', playerCount: props.defaultBoardPlayers }
      : props.rooms.find((r) => r.joinCode === selectedCode) ?? {
          name: `Room ${selectedCode}`,
          joinCode: selectedCode,
          playerCount: 0,
        }
    : null

  return (
    <>
      <Hotspot
        rect={rect.upstairs}
        label="Upstairs"
        href="/home"
        onClick={onUpstairs}
      />

      {composition === 'landscape' && (
        <>
          <CorkboardTickets
            rooms={props.rooms}
            roomsLoading={props.roomsLoading}
            defaultBoardPlayers={props.defaultBoardPlayers}
            selectedCode={selectedCode}
            currentUserId={props.currentUserId}
            renderPackUp={props.renderPackUp}
            onSelectTicket={onSelectTicket}
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
      )}

      {/* Right-side easel preview placeholder (upgraded to animated Magic Easel in S3) */}
      <div
        data-testid="magic-easel"
        className="studio-magic-placeholder"
        style={rectToPercent(rect.magicEasel, composition)}
      >
        <div className="pp-panel studio-magic-placeholder__card">
          {selectedRoom ? (
            <>
              <div className="text-lg uppercase text-[var(--sunset-1)] truncate">
                {selectedRoom.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedRoom.joinCode === 'play' ? 'OPEN' : selectedRoom.joinCode} · {selectedRoom.playerCount}{' '}
                {selectedRoom.playerCount === 1 ? 'painter' : 'painters'}
              </div>
              <Link
                to={`/r/${selectedRoom.joinCode}`}
                data-testid="magic-easel-step-in"
                className="pp-btn px-3 py-1 text-base uppercase"
              >
                Step in
              </Link>
            </>
          ) : (
            <div className="text-sm uppercase text-[var(--soft-text)]">
              Pick a ticket to conjure an easel
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function StudioLobby(props: StudioLobbyProps) {
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [composition, setComposition] = useState<'landscape' | 'portrait'>(() =>
    typeof window !== 'undefined' ? compositionFor(window.innerWidth, window.innerHeight) : 'landscape',
  )
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [hatEffect, setHatEffect] = useState<HatEffect>('idle')
  const [hatError, setHatError] = useState<string | null>(null)
  const [settling, setSettling] = useState(() => {
    if (typeof window === 'undefined') return false
    let fromPorch = false
    try {
      fromPorch = sessionStorage.getItem('studio-from-porch') === '1'
      if (fromPorch) sessionStorage.removeItem('studio-from-porch')
    } catch {
      fromPorch = false
    }
    return fromPorch && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const [panningUp, setPanningUp] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const stage = root.current?.querySelector('.studio-world__stage') as HTMLElement | null
    const shell = root.current?.closest('.porch-shell') as HTMLElement | null
    if (!stage || !shell) return
    const previous = shell.style.getPropertyValue('--px')
    const sync = () => {
      const bounds = stage.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const comp = compositionFor(bounds.width, bounds.height)
      const scale = integerScale(bounds.width, bounds.height, comp)
      const cropBottom = Math.max(0, (sceneSize(comp).h * scale - bounds.height) / 2)
      shell.style.setProperty('--px', `${scale}px`)
      stage.style.setProperty('--studio-crop-bottom', `${cropBottom}px`)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(stage)
    return () => {
      observer.disconnect()
      if (previous) shell.style.setProperty('--px', previous)
      else shell.style.removeProperty('--px')
    }
  }, [])

  useEffect(() => {
    if (!settling) return
    const raf = requestAnimationFrame(() => setSettling(false))
    return () => cancelAnimationFrame(raf)
  }, [settling])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (hatTimer.current) clearTimeout(hatTimer.current)
    }
  }, [])

  const goUpstairs = useCallback(
    (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return
      }
      event.preventDefault()
      if (timer.current) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        navigate('/home')
        return
      }
      setPanningUp(true)
      timer.current = setTimeout(() => navigate('/home'), 300)
    },
    [navigate],
  )

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

  const handleSelectTicket = useCallback(
    (code: string) => {
      setHatError(null)
      setSelectedCode(code)
      if (composition === 'portrait') {
        root.current?.querySelector('.studio-world__stage')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        })
      }
    },
    [composition],
  )

  const handleCodeSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = props.joinCodeInput.trim()
      if (!trimmed) return
      if (hatTimer.current) {
        clearTimeout(hatTimer.current)
        hatTimer.current = null
      }
      setHatError(null)
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setHatEffect(reduced ? 'sparkle' : 'dropping')

      const result = await props.onConjureCode(trimmed)
      if (result.status === 'not_found') {
        setHatEffect('smoke')
        setHatError('No easel by that name')
        hatTimer.current = setTimeout(() => setHatEffect('idle'), 1400)
        return
      }
      setHatEffect('sparkle')
      setSelectedCode(result.joinCode)
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

  const cameraY = panningUp
    ? Math.max(240, Math.round((root.current?.clientHeight ?? 600) * 0.45))
    : settling
      ? 36
      : 0

  return (
    <div ref={root} data-testid="lobby-page" className="studio-world" data-composition={composition}>
      <div className="studio-world__stage">
        <PixelScene
          draw={draw}
          className="studio-world__scene"
          camera={{ x: 0, y: cameraY, zoom: 1 }}
          zoomMs={300}
        >
          <StudioObjects
            props={props}
            selectedCode={selectedCode}
            hatEffect={hatEffect}
            hatError={hatError}
            onSelectTicket={handleSelectTicket}
            onJoinCodeChange={(v) => {
              setHatError(null)
              props.onJoinCodeChange(v)
            }}
            onSubmitCode={handleCodeSubmit}
            onUpstairs={goUpstairs}
            onComposition={setComposition}
          />
        </PixelScene>

        <nav className="studio-dock" aria-label="Studio shortcuts">
          <a href="/home" onClick={goUpstairs}>Upstairs</a>
          <Link to="/r/play">Public board</Link>
          <button type="button" onClick={() => jumpToForm('create-room-name')}>
            Set up easel
          </button>
          <button type="button" onClick={() => jumpToForm('join-code-input')}>
            Got a code?
          </button>
        </nav>
      </div>

      {composition === 'portrait' && (
        <div className="studio-mobile-shelf">
          <CorkboardTickets
            rooms={props.rooms}
            roomsLoading={props.roomsLoading}
            defaultBoardPlayers={props.defaultBoardPlayers}
            selectedCode={selectedCode}
            currentUserId={props.currentUserId}
            renderPackUp={props.renderPackUp}
            onSelectTicket={handleSelectTicket}
            mobile
          />
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
    </div>
  )
}
