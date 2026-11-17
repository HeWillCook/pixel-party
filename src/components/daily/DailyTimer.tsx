import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { DAILY } from '../../game/config'

export interface DailyTimerProps {
  startedAt?: number
  endsAt?: number
  clockOffsetMs?: number
}

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function DailyTimer({ startedAt, endsAt, clockOffsetMs = 0 }: DailyTimerProps) {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 250)
    return () => clearInterval(interval)
  }, [])

  const targetEnd = endsAt ?? (startedAt !== undefined ? startedAt + DAILY.attemptMs : undefined)
  const remainingMs = targetEnd !== undefined ? Math.max(0, targetEnd - now - clockOffsetMs) : DAILY.attemptMs
  const urgent = remainingMs > 0 && remainingMs <= 60_000

  return (
    <span
      data-testid="daily-timer"
      className={`inline-flex items-center gap-2 px-2.5 py-1 text-2xl ${
        urgent
          ? 'bg-secondary text-[var(--sunset-2)] ring-1 ring-ring'
          : 'bg-secondary text-foreground'
      }`}
      title="Time remaining in daily attempt"
    >
      <Clock className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
      <span>{formatTimer(remainingMs)}</span>
    </span>
  )
}
