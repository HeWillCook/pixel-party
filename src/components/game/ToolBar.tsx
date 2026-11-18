import type { ReactNode } from 'react'
import type { Tool } from '../../game/tools'
import { cn } from '../../lib/utils'

export interface ToolBarProps {
  tools: readonly Tool[]
  active: Tool
  onSelect: (tool: Tool) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  disabled?: boolean
}

function PixelIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  )
}

const TOOL_META: Record<Tool, { label: string; icon: ReactNode }> = {
  paint: {
    label: 'Paint',
    icon: (
      <PixelIcon>
        <rect x="10" y="2" width="3" height="3" />
        <rect x="8" y="4" width="3" height="3" />
        <rect x="6" y="6" width="3" height="3" />
        <rect x="4" y="8" width="3" height="3" />
        <rect x="2" y="10" width="3" height="3" />
        <rect x="2" y="12" width="2" height="2" />
      </PixelIcon>
    ),
  },
  erase: {
    label: 'Erase',
    icon: (
      <PixelIcon>
        <rect x="6" y="3" width="6" height="2" />
        <rect x="4" y="5" width="7" height="3" />
        <rect x="3" y="8" width="6" height="4" />
        <rect x="2" y="12" width="12" height="2" />
      </PixelIcon>
    ),
  },
  fill: {
    label: 'Fill',
    icon: (
      <PixelIcon>
        <rect x="5" y="2" width="4" height="2" />
        <rect x="3" y="4" width="6" height="5" />
        <rect x="4" y="9" width="5" height="2" />
        <rect x="10" y="7" width="2" height="3" />
        <rect x="11" y="10" width="2" height="4" />
      </PixelIcon>
    ),
  },
  pick: {
    label: 'Pick colour',
    icon: (
      <PixelIcon>
        <rect x="10" y="2" width="4" height="4" />
        <rect x="8" y="5" width="3" height="3" />
        <rect x="6" y="7" width="3" height="3" />
        <rect x="4" y="9" width="3" height="3" />
        <rect x="2" y="12" width="2" height="2" />
      </PixelIcon>
    ),
  },
}

const UNDO_ICON = (
  <PixelIcon>
    <rect x="4" y="3" width="2" height="2" />
    <rect x="2" y="5" width="10" height="2" />
    <rect x="4" y="7" width="2" height="2" />
    <rect x="11" y="7" width="2" height="4" />
    <rect x="6" y="11" width="7" height="2" />
  </PixelIcon>
)

const REDO_ICON = (
  <PixelIcon>
    <rect x="10" y="3" width="2" height="2" />
    <rect x="4" y="5" width="10" height="2" />
    <rect x="10" y="7" width="2" height="2" />
    <rect x="3" y="7" width="2" height="4" />
    <rect x="3" y="11" width="7" height="2" />
  </PixelIcon>
)

export function ToolBar({
  tools,
  active,
  onSelect,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  disabled = false,
}: ToolBarProps) {
  return (
    <div
      data-testid="toolbar"
      role="group"
      aria-label="Drawing tools"
      className="pp-panel flex flex-col gap-1.5 bg-card p-2"
    >
      {tools.map((tool) => {
        const meta = TOOL_META[tool]
        const isSelected = active === tool
        return (
          <button
            key={tool}
            type="button"
            data-testid={`tool-${tool}`}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelect(tool)}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 border-2 px-2.5 py-1.5 text-left text-base uppercase tracking-wider transition-colors',
              isSelected
                ? 'border-[var(--sunset-1)] bg-secondary text-foreground'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {meta.icon}
            <span>{meta.label}</span>
          </button>
        )
      })}

      {onUndo && (
        <button
          type="button"
          data-testid="tool-undo"
          disabled={disabled || !canUndo}
          onClick={onUndo}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 border-2 border-border bg-background/60 px-2.5 py-1.5 text-left text-base uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
            (disabled || !canUndo) && 'cursor-not-allowed opacity-50',
          )}
        >
          {UNDO_ICON}
          <span>Undo</span>
        </button>
      )}

      {onRedo && (
        <button
          type="button"
          data-testid="tool-redo"
          disabled={disabled || !canRedo}
          onClick={onRedo}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 border-2 border-border bg-background/60 px-2.5 py-1.5 text-left text-base uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
            (disabled || !canRedo) && 'cursor-not-allowed opacity-50',
          )}
        >
          {REDO_ICON}
          <span>Redo</span>
        </button>
      )}
    </div>
  )
}
