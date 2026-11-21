import { useState } from 'react'
import { getAuthToken } from 'deepspace'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../ui'

export function DeleteRoomDialog({
  joinCode,
  open,
  onOpenChange,
  onDeleted,
}: {
  joinCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      const token = await getAuthToken()
      const response = await fetch('/api/actions/deleteRoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ joinCode }),
      })
      const result = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !result.success) {
        setError(result.error ?? 'Could not pack up the room. Please try again.')
        return
      }
      onOpenChange(false)
      onDeleted?.()
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!deleting) onOpenChange(value) }}>
      <DialogContent hideClose={deleting}>
        <DialogTitle>Pack up room {joinCode}?</DialogTitle>
        <DialogDescription>This ends the room for everyone. This code cannot be used again.</DialogDescription>
        {error && <p role="alert" className="text-base text-[var(--sunset-2)]">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" className="pp-chip text-base uppercase" disabled={deleting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="pp-chip pp-danger pp-danger-solid text-base uppercase" loading={deleting} onClick={() => void remove()}>Pack up</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteRoomButton({ joinCode, onDeleted, label = 'Pack up' }: { joinCode: string; onDeleted?: () => void; label?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" size="sm" variant="secondary" className="pp-chip pp-danger h-8 text-base uppercase" onClick={() => setOpen(true)}>{label}</Button>
      <DeleteRoomDialog joinCode={joinCode} open={open} onOpenChange={setOpen} onDeleted={onDeleted} />
    </>
  )
}
