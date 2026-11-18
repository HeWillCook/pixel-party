import { PALETTE } from '../../game/config'
import { cn } from '../../lib/utils'

const COLOR_NAMES: Record<number, string> = {
  16: 'White',
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
}: PaletteProps) {
  const colorIndices = [1, 16, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  const isCoolingDown = cooldownRemainingMs > 0

  return (
    <div
      data-testid="palette"
      className="mx-auto flex flex-col items-center gap-1"
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5">
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
                'relative h-6 w-6 cursor-pointer border-2 border-background transition-transform sm:h-7 sm:w-7',
                isSelected && '-translate-y-1 outline-2 outline-offset-2 outline-[var(--sunset-1)]',
                disabled && 'cursor-not-allowed opacity-60',
              )}
              style={{
                backgroundColor: hex,
                '--swatch': hex,
                boxShadow: isSelected ? 'inset 0 0 0 3px var(--sunset-1)' : undefined,
                zIndex: isSelected ? 10 : undefined,
              } as React.CSSProperties}
            >
              <span aria-hidden="true" className="hidden" />
              {isSelected && <span className="sr-only">Selected</span>}
            </button>
          )
        })}
      </div>

      {isCoolingDown && (
        <span
          data-testid="palette-cooldown"
          className="text-sm text-[var(--sunset-1)]"
        >
          Wait {(cooldownRemainingMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  )
}
