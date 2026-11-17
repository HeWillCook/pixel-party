import { getUserColor, type PresencePeerClient } from 'deepspace'

export interface PlayerCursorsProps {
  peers: PresencePeerClient[]
  width: number
  height: number
}

interface CursorCoords {
  x: number
  y: number
}

function readCursor(state: Record<string, unknown>): CursorCoords | null {
  if ('cursor' in state && state.cursor === null) return null
  const raw = state.cursor ?? state
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.x === 'number' && typeof candidate.y === 'number') {
    if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y)) {
      return { x: candidate.x, y: candidate.y }
    }
  }
  return null
}

export function PlayerCursors({ peers, width, height }: PlayerCursorsProps) {
  return (
    <div
      data-testid="player-cursors"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {peers.map((peer) => {
        const cursor = readCursor(peer.state)
        if (!cursor) return null
        if (cursor.x < 0 || cursor.x >= width || cursor.y < 0 || cursor.y >= height) {
          return null
        }
        const color = getUserColor(peer.userId)
        const label = peer.userName || 'Painter'
        return (
          <div
            key={peer.userId}
            data-testid={`peer-cursor-${peer.userId}`}
            className="absolute transition-all duration-100 ease-out"
            style={{
              left: `${(cursor.x / width) * 100}%`,
              top: `${(cursor.y / height) * 100}%`,
              width: `${100 / width}%`,
              height: `${100 / height}%`,
            }}
          >
            <div
              className="h-full w-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.85)]"
              style={{ borderColor: color }}
            />
            <span
              className="absolute -top-5 left-0 whitespace-nowrap px-1 py-0.5 text-xs text-background shadow"
              style={{ backgroundColor: color }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
