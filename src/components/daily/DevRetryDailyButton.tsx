// DEV ONLY (__DEBUG_TOOLS__)
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { Button } from '../ui'

export function DevRetryDailyButton({
  onAfterReset,
  autoStart = true,
  compact = false,
  className = '',
}: {
  onAfterReset?: () => void
  autoStart?: boolean
  compact?: boolean
  className?: string
}) {
  const { reset, start } = useDaily()
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await reset()
      if (!ok) return
      onAfterReset?.()
      if (autoStart) await start()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      data-testid="dev-retry-daily"
      disabled={busy}
      onClick={() => void handleClick()}
      className={`pp-chip gap-1.5 uppercase ${compact ? 'min-h-[30px] px-2 text-xs' : 'min-h-[36px] px-3 text-sm'} ${className}`.trim()}
      title="Dev-only testing button: reset today's attempt using the same prompt"
    >
      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{busy ? 'Resetting…' : 'Retry daily (debug)'}</span>
    </Button>
  )
}
