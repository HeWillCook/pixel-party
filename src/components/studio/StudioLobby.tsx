import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe, Hash, Lock, Plus, Users } from 'lucide-react'
import { Hotspot } from '../../scene/Hotspot'
import { PixelScene, SceneComposition } from '../../scene/PixelScene'
import { compositionFor, integerScale, rectToPercent } from '../../scene/camera'
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
  defaultBoardStatus?: string
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
  onJoinCode: (e: FormEvent) => void
  renderPackUp: (room: StudioRoomItem) => ReactNode
}

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
          <Plus className={compact ? 'studio-order-form__icon shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden />
          {creating ? 'Setting up…' : 'Set up & open'}
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
  onJoinCodeChange,
  onJoinCode,
  boothCounter = false,
}: Pick<StudioLobbyProps, 'joinCodeInput' | 'joining' | 'onJoinCodeChange' | 'onJoinCode'> & {
  boothCounter?: boolean
}) {
  if (boothCounter) {
    return (
      <form
        data-testid="join-room-form"
        onSubmit={onJoinCode}
        className="studio-ticket-booth"
      >
        <h3 className="studio-ticket-booth__sign">Got a code?</h3>
        <div className="pp-panel studio-ticket-card">
          <div className="studio-ticket-card__row">
            <div className="relative flex-1 min-w-0">
              <Hash
                className="pointer-events-none absolute left-1.5 top-1/2 studio-ticket-card__hash -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                data-testid="join-code-input"
                placeholder="Enter 4-char code"
                maxLength={64}
                value={joinCodeInput}
                onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
                disabled={joining}
                className="studio-ticket-card__input"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              data-testid="join-code-submit"
              disabled={joining || !joinCodeInput.trim()}
              className="pp-btn studio-ticket-card__btn"
            >
              {joining ? '…' : 'Join'}
            </Button>
          </div>
        </div>
      </form>
    )
  }

  return (
    <form
      data-testid="join-room-form"
      onSubmit={onJoinCode}
      className="pp-panel studio-booth-form"
    >
      <h3 className="studio-booth-form__title">Got a code?</h3>
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
          {joining ? 'Joining…' : 'Join'}
        </Button>
      </div>
    </form>
  )
}

function MoreEaselsList({
  rooms,
  currentUserId,
  renderPackUp,
  mobile = false,
  style,
}: {
  rooms: StudioRoomItem[]
  currentUserId?: string
  renderPackUp: (room: StudioRoomItem) => ReactNode
  mobile?: boolean
  style?: React.CSSProperties
}) {
  if (rooms.length === 0) return null
  return (
    <div
      style={style}
      className={`pp-panel studio-more-easels ${mobile ? 'studio-more-easels--mobile' : ''}`}
    >
      <div className="studio-more-easels__heading">More easels</div>
      <div className="studio-more-easels__items">
        {rooms.map((room) => (
          <div key={room.recordId} className="studio-more-easels__row">
            <Link
              to={`/r/${room.joinCode}`}
              data-testid={`room-card-${room.joinCode}`}
              className="studio-more-easels__link"
            >
              <span className="truncate">{room.name}</span>
              <span className="shrink-0 text-[var(--soft-text)]">
                {room.joinCode} · {room.playerCount}
              </span>
            </Link>
            {currentUserId === room.hostId && renderPackUp(room)}
          </div>
        ))}
      </div>
    </div>
  )
}

function StudioObjects({
  props,
  onUpstairs,
  onComposition,
  onJumpToForm,
}: {
  props: StudioLobbyProps
  onUpstairs: (event: MouseEvent) => void
  onComposition: (c: 'landscape' | 'portrait') => void
  onJumpToForm: (testId: 'create-room-name' | 'join-code-input') => void
}) {
  const composition = useContext(SceneComposition)
  useEffect(() => {
    onComposition(composition)
  }, [composition, onComposition])

  const rect = studioLayout[composition]
  const visibleEasels = props.rooms.slice(0, rect.easels.length)
  const overflowEasels = props.rooms.slice(rect.easels.length)

  return (
    <>
      <Hotspot
        rect={rect.upstairs}
        label="Upstairs"
        href="/home"
        onClick={onUpstairs}
      />

      <Hotspot
        rect={rect.publicBoardArt}
        label="Public board"
        href="/r/play"
        testId="room-card-play"
      />

      <div
        className="studio-plaque-wrap"
        style={rectToPercent(rect.publicBoardPlaque, composition)}
      >
        <Link
          to="/r/play"
          data-testid="lobby-play-now"
          className="studio-plaque"
        >
          <span className="truncate font-normal">
            Public board · {props.defaultBoardPlayers}
          </span>
          <span className="studio-plaque__cta">Play now</span>
        </Link>
      </div>

      <div data-testid="public-rooms-list" className="studio-rooms-layer">
        <h2 className="sr-only">Live Public Rooms</h2>
        {visibleEasels.length === 0 ? (
          <>
            <div
              className="studio-easel-slot studio-easel-slot--empty"
              style={rectToPercent(rect.easels[0], composition)}
            >
              <div className="studio-easel-chalk">
                {props.roomsLoading ? 'Looking around…' : 'No custom easels yet'}
              </div>
            </div>
            {rect.easels[rect.easels.length - 1] && (
              <div
                className="studio-easel-slot studio-easel-slot--empty"
                style={rectToPercent(rect.easels[rect.easels.length - 1], composition)}
              >
                <button
                  type="button"
                  onClick={() => onJumpToForm('create-room-name')}
                  className="studio-easel-tag"
                >
                  Set up an easel
                </button>
              </div>
            )}
          </>
        ) : (
          visibleEasels.map((room, index) => {
            const slot = rect.easels[index]
            return (
              <div
                key={room.recordId}
                className="studio-easel-slot"
                style={rectToPercent(slot, composition)}
              >
                <Link
                  to={`/r/${room.joinCode}`}
                  data-testid={`room-card-${room.joinCode}`}
                  className="studio-pennant"
                >
                  <span className="truncate studio-pennant__name">{room.name}</span>
                  <span className="studio-pennant__meta">
                    <span>{room.joinCode}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Users className="studio-pennant__user-icon shrink-0" aria-hidden />
                      {room.playerCount}
                    </span>
                  </span>
                </Link>
                {props.currentUserId === room.hostId && (
                  <div className="studio-pack-wrap">{props.renderPackUp(room)}</div>
                )}
              </div>
            )
          })
        )}

        {composition === 'landscape' && (
          <MoreEaselsList
            rooms={overflowEasels}
            currentUserId={props.currentUserId}
            renderPackUp={props.renderPackUp}
            style={rectToPercent(rect.moreEasels, composition)}
          />
        )}
      </div>

      {composition === 'landscape' && (
        <>
          <div
            className="studio-booth-slot"
            style={rectToPercent(rect.joinBooth, composition)}
          >
            <JoinCodeForm
              joinCodeInput={props.joinCodeInput}
              joining={props.joining}
              onJoinCodeChange={props.onJoinCodeChange}
              onJoinCode={props.onJoinCode}
              boothCounter
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
    </>
  )
}

export function StudioLobby(props: StudioLobbyProps) {
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const shelfRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [composition, setComposition] = useState<'landscape' | 'portrait'>('landscape')
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

  // Keep .porch-shell (including nav) at the exact integer scene scale of the studio
  // without mutating document.documentElement.style.--px.
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
      shell.style.setProperty('--px', `${scale}px`)
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

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, frame: number) => {
      drawStudio(ctx, frame, {
        easelCount: props.rooms.length,
        hasDefaultBoard: true,
      })
    },
    [props.rooms.length],
  )

  const jumpToForm = useCallback((testId: 'create-room-name' | 'join-code-input') => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
    if (!el) return
    el.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    })
    el.focus({ preventScroll: true })
  }, [])

  const cameraY = panningUp
    ? Math.max(240, Math.round((root.current?.clientHeight ?? 600) * 0.45))
    : settling
      ? 36
      : 0

  const overflowEasels = props.rooms.slice(studioLayout[composition].easels.length)

  return (
    <div ref={root} data-testid="lobby-page" className="studio-world">
      <div className="studio-world__stage">
        <PixelScene
          draw={draw}
          className="studio-world__scene"
          camera={{ x: 0, y: cameraY, zoom: 1 }}
          zoomMs={300}
        >
          <StudioObjects
            props={props}
            onUpstairs={goUpstairs}
            onComposition={setComposition}
            onJumpToForm={jumpToForm}
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
        <div ref={shelfRef} className="studio-mobile-shelf">
          <MoreEaselsList
            rooms={overflowEasels}
            currentUserId={props.currentUserId}
            renderPackUp={props.renderPackUp}
            mobile
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
          <JoinCodeForm
            joinCodeInput={props.joinCodeInput}
            joining={props.joining}
            onJoinCodeChange={props.onJoinCodeChange}
            onJoinCode={props.onJoinCode}
          />
        </div>
      )}
    </div>
  )
}
