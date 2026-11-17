import { Clock, Users, Share2, Check, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import type { RoundView } from '../../game/protocol'
import { Button } from '../ui'

export interface RoundBarProps {
  round: RoundView | null
  players: number
  connected: boolean
  now: number
  joinCode: string
  roomName?: string
  pixelsCount?: number
}

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RoundBar({
  round,
  players,
  connected,
  now,
  joinCode,
  roomName,
  pixelsCount = 0,
}: RoundBarProps) {
  const [copied, setCopied] = useState(false)

  const remainingMs =
    round?.endsAt != null && round.state === 'playing'
      ? Math.max(0, round.endsAt - now)
      : 0

  const handleCopyShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/r/${joinCode}`
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable in some contexts
    }
  }

  return (
    <div
      data-testid="round-bar"
      className="arcade-card flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2.5 sm:px-4 sm:py-3"
    >
      {/* Left: Room & Secret Word */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-400" aria-label="Connected" />
          ) : (
            <span
              data-testid="round-reconnecting"
              className="font-pixel inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300"
            >
              <WifiOff className="h-3 w-3 text-amber-400" aria-hidden />
              Reconnecting…
            </span>
          )}
          <span className="font-pixel text-xs uppercase tracking-wider text-muted-foreground">
            {roomName || (joinCode === 'play' ? 'Public Board' : `Room ${joinCode}`)}
          </span>
        </div>

        <div className="h-4 w-px bg-border hidden sm:block" />

        <div className="flex items-center gap-2">
          <span className="font-pixel text-[11px] uppercase tracking-wider text-muted-foreground">
            Draw:
          </span>
          <span
            data-testid="round-word"
            className="font-pixel rounded-md border-2 border-amber-400/80 bg-amber-400/15 px-2.5 py-0.5 text-sm font-extrabold uppercase tracking-wider text-amber-300 sm:text-base"
          >
            {round ? round.word : 'LOADING…'}
          </span>
        </div>
      </div>

      {/* Right: Timer, Players, Pixels, Share */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {round?.state === 'paused' ? (
          <span
            data-testid="round-timer"
            className="font-pixel inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-xs font-bold text-amber-300"
          >
            PAUSED
          </span>
        ) : round?.state === 'intermission' ? (
          <span
            data-testid="round-timer"
            className="font-pixel inline-flex items-center gap-1 rounded bg-pink-500/20 px-2 py-1 text-xs font-bold text-pink-300"
          >
            NEXT ROUND SOON
          </span>
        ) : (
          <span
            data-testid="round-timer"
            className="font-pixel inline-flex items-center gap-1.5 rounded bg-secondary px-2.5 py-1 text-xs font-bold text-foreground"
            title="Time remaining in round"
          >
            <Clock className="h-3.5 w-3.5 text-amber-400" aria-hidden />
            {round ? formatTimer(remainingMs) : '--:--'}
          </span>
        )}

        <span
          data-testid="round-players"
          className="font-pixel inline-flex items-center gap-1.5 rounded bg-secondary px-2.5 py-1 text-xs font-bold text-foreground"
          title="Signed-in painters connected"
        >
          <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
          {players} {players === 1 ? 'painter' : 'painters'}
        </span>

        <span
          data-testid="round-pixels"
          className="font-pixel hidden rounded bg-secondary px-2 py-1 text-xs text-muted-foreground md:inline-flex"
        >
          {pixelsCount} px
        </span>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="share-room-button"
          onClick={handleCopyShare}
          className="arcade-btn font-pixel h-8 gap-1.5 px-2.5 text-xs font-bold"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5" aria-hidden />
              Share
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
