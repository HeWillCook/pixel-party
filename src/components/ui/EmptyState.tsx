import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface Action {
  label: string
  onClick: () => void
}

interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  icon?: ReactNode
  title: string
  description?: string
  action?: Action
  secondaryAction?: Action
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-4 py-16 text-center', className)}
      {...props}
    >
      {icon && (
        <div className="pp-chip mb-4 flex size-12 items-center justify-center text-[var(--sunset-1)] [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-xl uppercase text-[var(--sunset-2)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-base text-muted-foreground">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-2">
          {action && <Button onClick={action.onClick}>{action.label}</Button>}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
