import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../ui'

export function ExitDailyButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button data-testid="daily-exit" size="sm" variant="secondary" onClick={() => setOpen(true)}>Exit</Button>
      <DialogContent>
        <DialogTitle>Leave the easel?</DialogTitle>
        <DialogDescription>Your 10 minutes keep running. Auto-grades still happen while this site is open, and you can come back any time before time runs out.</DialogDescription>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Keep painting</Button>
          <Button onClick={() => navigate('/party')}>Exit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
