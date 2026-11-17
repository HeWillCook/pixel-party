import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { DAILY } from '../../game/config'

export interface DailyTimerProps {
  startedAt?: number
  endsAt?: number
}

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function DailyTimer({ startedAt, endsAt }: DailyTimerProps) {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 250)
    return () => clearInterval(interval)
  }, [])

  const targetEnd = endsAt ?? (startedAt !== undefined ? startedAt + DAILY.attemptMs : undefined)
  const remainingMs = targetEnd !== undefined ? Math.max(0, targetEnd - now) : DAILY.attemptMs
  const urgent = remainingMs > 0 && remainingMs <= 60_000

  return (
    <span
      data-testid="daily-timer"
      className={`font-pixel inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold ${
        urgent
          ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/50'
          : 'bg-secondary text-foreground'
      }`}
      title="Time remaining in daily attempt"
    >
      <Clock className={`h-3.5 w-3.5 ${urgent ? 'text-rose-400' : 'text-amber-400'}`} aria-hidden />
      <span>{formatTimer(remainingMs)}</span>
    </span>
  )
}
