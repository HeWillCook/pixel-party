import { PALETTE } from '../../game/config'
import { cn } from '../../lib/utils'

const COLOR_NAMES: Record<number, string> = {
  1: 'Black',
  2: 'Light Gray',
  3: 'Dark Gray',
  4: 'Red',
  5: 'Orange',
  6: 'Yellow',
  7: 'Green',
  8: 'Dark Green',
  9: 'Cyan',
  10: 'Blue',
  11: 'Dark Blue',
  12: 'Purple',
  13: 'Pink',
  14: 'Brown',
  15: 'Cream',
}

export interface PaletteProps {
  activeColor: number
  onSelectColor: (color: number) => void
  disabled?: boolean
  cooldownRemainingMs?: number
  cooldownTotalMs?: number
}

export function Palette({
  activeColor,
  onSelectColor,
  disabled = false,
  cooldownRemainingMs = 0,
  cooldownTotalMs = 200,
}: PaletteProps) {
  const colorIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  const isCoolingDown = cooldownRemainingMs > 0
  const progressPct = isCoolingDown
    ? Math.min(100, Math.max(0, (cooldownRemainingMs / Math.max(200, cooldownTotalMs)) * 100))
    : 0

  return (
    <div
      data-testid="palette"
      className="arcade-card rounded-lg bg-card p-2.5 sm:p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-xs border border-white/30 shadow-inner"
            style={{ backgroundColor: PALETTE[activeColor] }}
          />
          <span className="font-pixel text-xs font-bold uppercase tracking-wider text-foreground">
            {COLOR_NAMES[activeColor] ?? `Color ${activeColor}`}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isCoolingDown ? (
            <span
              data-testid="palette-cooldown"
              className="font-pixel inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300 ring-1 ring-amber-400/40"
            >
              Wait {(cooldownRemainingMs / 1000).toFixed(1)}s
            </span>
          ) : (
            <span className="font-pixel text-[11px] text-muted-foreground">
              {disabled ? 'Spectating' : `Brush ready (${(cooldownTotalMs / 1000).toFixed(1)}s cd)`}
            </span>
          )}
        </div>
      </div>

      {/* Cooldown progress bar */}
      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-background/80">
        <div
          className="h-full bg-amber-400 transition-all duration-75"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-15 sm:gap-1.5">
        {colorIndices.map((colorIdx) => {
          const hex = PALETTE[colorIdx]
          const isSelected = activeColor === colorIdx
          return (
            <button
              key={colorIdx}
              type="button"
              data-testid={`swatch-${colorIdx}`}
              disabled={disabled}
              onClick={() => onSelectColor(colorIdx)}
              aria-label={`Select ${COLOR_NAMES[colorIdx] ?? `color ${colorIdx}`}`}
              aria-pressed={isSelected}
              title={COLOR_NAMES[colorIdx]}
              className={cn(
                'relative h-8 w-full rounded-sm border-2 transition-transform focus-visible:outline-2 focus-visible:outline-primary sm:h-9',
                isSelected
                  ? '-translate-y-0.5 border-amber-300 ring-2 ring-amber-400/80 shadow-[0_3px_0_0_rgba(0,0,0,0.7)]'
                  : 'border-black/50 hover:-translate-y-0.5 hover:border-white/50 shadow-[0_2px_0_0_rgba(0,0,0,0.5)]',
                disabled && 'cursor-not-allowed opacity-60 hover:translate-y-0',
              )}
              style={{ backgroundColor: hex }}
            >
              {isSelected && (
                <span className="sr-only">Selected</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
