import { Moon, Sparkles } from 'lucide-react'
import { studioSprites } from '../../scene/studio/sprites'
import { StudioSprite } from '../play/StudioSprite'
import { Button } from '../ui'

export interface AskAiButtonProps {
  askAvailableAt: number
  now: number
  isSpectator: boolean
  aiResting: boolean
  roundPlaying: boolean
  onAsk: () => void
}

export function AskAiButton({
  askAvailableAt,
  now,
  isSpectator,
  aiResting,
  roundPlaying,
  onAsk,
}: AskAiButtonProps) {
  const waitMs = Math.max(0, askAvailableAt - now)
  const waitSec = Math.ceil(waitMs / 1000)
  const isDisabled = isSpectator || aiResting || !roundPlaying || waitMs > 0

  let label = 'Ask Haiku'
  if (aiResting) {
    label = "Haiku's napping — back tomorrow"
  } else if (isSpectator) {
    label = 'Sign in to Ask Haiku'
  } else if (!roundPlaying) {
    label = 'Waiting for active round…'
  } else if (waitMs > 0) {
    label = `Ask Haiku (${waitSec}s)`
  }

  return (
    <Button
      type="button"
      data-testid="ask-ai-button"
      disabled={isDisabled}
      onClick={onAsk}
      className="pp-btn room-bell-btn h-auto w-full gap-2 whitespace-normal px-3 py-1.5 text-[22px] leading-tight uppercase tracking-wider disabled:opacity-75"
    >
      {aiResting ? (
        <Moon className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <StudioSprite sprite={studioSprites.bell} scale={2} className="shrink-0" />
      )}
      <span>{label}</span>
      {!isDisabled && <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />}
    </Button>
  )
}
