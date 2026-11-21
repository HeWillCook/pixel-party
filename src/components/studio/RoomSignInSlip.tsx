import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { SignInSlip } from '../auth/SignInSlip'

/**
 * The sign-in slip of a room: it covers the room's board exactly (so no fragment of the lobby card or the painting ever
 * pokes out around it) and slides out of the room's ticket on the easel, its name plaque. The studio camera is parked on
 * the easel while a room is open, so both places on screen are read once, when the slip opens.
 */
export function RoomSignInSlip({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [place, setPlace] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const board = document.querySelector('.room-board')?.getBoundingClientRect()
    const plaque = document.querySelector('.studio-magic-easel__plaque')?.getBoundingClientRect()
    if (!board) { setPlace({ position: 'fixed', right: 16, top: 120, width: 340 }); return }
    const dx = plaque ? plaque.left + plaque.width / 2 - (board.left + board.width / 2) : 0
    const dy = plaque ? plaque.top + plaque.height / 2 - (board.top + board.height / 2) : 0
    setPlace({
      position: 'fixed',
      left: board.left,
      top: board.top,
      width: board.width,
      height: board.height,
      transformOrigin: '50% 50%',
      ['--slip-hide' as string]: `translate(${dx}px, ${dy}px) scale(0.15)`,
    })
  }, [open])
  if (!place) return null
  return createPortal(<SignInSlip fill open={open} onClose={onClose} style={place} />, document.body)
}
