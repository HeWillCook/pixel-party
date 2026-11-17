import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" data-testid="mute-button" aria-pressed={muted} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} onClick={onToggle}>
      {muted ? <VolumeX /> : <Volume2 />}
    </Button>
  )
}
