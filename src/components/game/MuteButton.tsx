import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      data-testid="mute-button"
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      onClick={onToggle}
      className="pp-chip h-8 w-8 p-0 text-[var(--sunset-1)] hover:bg-secondary hover:text-[var(--sunset-1)]"
      style={{ borderRadius: 0 }}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  )
}
