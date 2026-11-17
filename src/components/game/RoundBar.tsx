import { Check, Share2, WifiOff } from 'lucide-react'
import { useState } from 'react'
import type { RoundView } from '../../game/protocol'

export interface RoundBarProps {
  round: RoundView | null
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
  connected,
  now,
  joinCode,
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
      className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-[24px] leading-none text-[var(--soft-text)]"
    >
      {!connected && (
        <span
          data-testid="round-reconnecting"
          className="pp-chip inline-flex items-center gap-1 text-base uppercase"
        >
          <WifiOff className="h-3.5 w-3.5 text-[var(--sunset-2)]" aria-hidden />
          Reconnecting…
        </span>
      )}

      <span>DRAW:</span>

      <span
        data-testid="round-word"
        className="pp-word text-[34px] uppercase leading-none"
      >
        {round ? round.word : 'LOADING…'}
      </span>

      {round?.state === 'paused' ? (
        <span data-testid="round-timer" className="uppercase text-[var(--sunset-1)]">
          PAUSED
        </span>
      ) : round?.state === 'intermission' ? (
        <span data-testid="round-timer" className="uppercase text-[var(--sunset-3)]">
          NEXT ROUND SOON
        </span>
      ) : (
        <span data-testid="round-timer" title="Time remaining in round">
          {round ? formatTimer(remainingMs) : '--:--'}
        </span>
      )}

      <span data-testid="round-pixels" className="uppercase">
        {pixelsCount} PX
      </span>

      <button
        type="button"
        data-testid="share-room-button"
        onClick={handleCopyShare}
        className="pp-chip inline-flex cursor-pointer items-center gap-1 text-base uppercase transition-opacity hover:opacity-90"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-[var(--sunset-1)]" aria-hidden />
            Copied!
          </>
        ) : (
          <>
            <Share2 className="h-3.5 w-3.5" aria-hidden />
            Share
          </>
        )}
      </button>
    </div>
  )
}
