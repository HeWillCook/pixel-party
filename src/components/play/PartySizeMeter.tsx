import { coopSize } from '../../game/scoring'

const HINT = 'Bigger drawings score more: fill a shape across most of the canvas.'

/**
 * Live size readout while a party round is playing: the same function the server scores with,
 * run on the client's current grid, so "go big" is a number painters can watch move.
 * It sits in the painter tray's tool row, so it costs the board no vertical space.
 */
export function PartySizeMeter({ cells, width, height }: { cells: Uint8Array; width: number; height: number }) {
  const percent = Math.round(coopSize(cells, width, height) * 100)
  return (
    <div data-testid="party-size-meter" title={HINT} className="flex items-center gap-1.5">
      <span
        className="hidden text-sm uppercase leading-none tracking-wide text-[#fff0cc] sm:inline"
        style={{ textShadow: '1px 1px 0 #392a45' }}
      >
        Size
      </span>
      <div
        role="progressbar"
        aria-label="Drawing size"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2.5 w-16 border-2 border-[#392a45] bg-[#985c5a]"
      >
        <div
          data-testid="party-size-fill"
          className="h-full bg-[#ffe29a] transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        data-testid="party-size-value"
        className="w-8 text-right text-sm leading-none text-[#fff0cc]"
        style={{ textShadow: '1px 1px 0 #392a45' }}
      >
        {percent}%
      </span>
    </div>
  )
}
