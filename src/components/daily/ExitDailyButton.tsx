import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../ui'

export function ExitDailyButton({ onExit, compact = false }: { onExit: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        data-testid="daily-exit"
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Back to porch"
        className={compact ? 'daily-porch-sign daily-porch-sign--compact' : 'daily-porch-sign'}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Porch</span>
      </Button>
      <DialogContent>
        <DialogTitle>Leave the easel?</DialogTitle>
        <DialogDescription>Your 10 minutes keep running. Auto-grades still happen while this site is open, and you can come back any time before time runs out.</DialogDescription>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Keep painting</Button>
          <Button onClick={() => { setOpen(false); onExit() }}>Exit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
