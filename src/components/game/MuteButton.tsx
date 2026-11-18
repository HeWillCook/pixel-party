import { Button } from '@/components/ui/Button'
import { P } from '@/scene/palette'
import { defineSprite } from '@/scene/sprite'
import { StudioSprite } from '../play/StudioSprite'

const radioColors = {
  d: P.wood[0],
  w: P.wood[2],
  h: P.wood[4],
  m: P.stone[0],
  p: P.paper[4],
  y: P.sun[4],
  r: P.flame[0],
  s: P.stone[2],
}

const radioOn = defineSprite(
  [
    '....d....d..y.y.',
    '.....d..d....y..',
    '..dddddddddddd..',
    '.dwwwwwwwwwwwwd.',
    '.dmmmdhhhdmmmd..',
    '.dmhmdhphdmhmd..',
    '.dmmmdhhhdmmmd..',
    '.dwwwwwwwwwwwwd.',
    '..dddddddddddd..',
  ],
  radioColors,
)

const radioOff = defineSprite(
  [
    '....d....d...r..',
    '.....d..d...r...',
    '..dddddddddrdd..',
    '.dssssssssrsssd.',
    '.dmmmsshsrsmmd..',
    '.dmhmspsrsmsmd..',
    '.dmmmssrsssmmd..',
    '.dssssrsssssssd.',
    '..dddrdddddddd..',
  ],
  radioColors,
)

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      data-testid="mute-button"
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      title={muted ? 'Unmute studio radio' : 'Mute studio radio'}
      onClick={onToggle}
      className="pp-chip h-8 w-10 p-0 text-[var(--sunset-1)] hover:bg-secondary hover:text-[var(--sunset-1)]"
      style={{ borderRadius: 0 }}
    >
      <StudioSprite sprite={muted ? radioOff : radioOn} scale={2} />
    </Button>
  )
}
