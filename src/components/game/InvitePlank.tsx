import { useCallback, useState } from 'react'
import { Copy, Share2 } from 'lucide-react'

/** `https://host/r/CODE`: what friends open. */
export function roomInviteUrl(code: string): string {
  return new URL(`/r/${encodeURIComponent(code)}`, window.location.origin).href
}

/** Copies the invite link and reports it ("Copy link" / "Copied!" / "Could not copy"). */
export function useCopyLink(code: string): { label: string; copy: () => Promise<void> } {
  const [label, setLabel] = useState('Copy link')
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomInviteUrl(code))
      setLabel('Copied!')
    } catch {
      setLabel('Could not copy')
    }
  }, [code])
  return { label, copy }
}

/** The system share sheet, where there is one (phones, Safari). */
function canShareInvite(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * "Invite friends": the room's four letters, large, on a plank in the room lobby, with Copy link and (when the
 * browser can) Share. The same code and link sit in the room's top bar during play.
 */
export function InvitePlank({ code }: { code: string }) {
  const { label, copy } = useCopyLink(code)
  const share = useCallback(async () => {
    try {
      await navigator.share({ title: 'Pixle', text: `Come paint with me in room ${code}!`, url: roomInviteUrl(code) })
    } catch {
      // Dismissing the share sheet is not an error.
    }
  }, [code])
  return (
    <section data-testid="invite-plank" className="invite-plank" aria-label="Invite friends">
      <p className="invite-plank__label">Invite friends</p>
      <p data-testid="invite-plank-code" className="invite-plank__code" aria-label={`Room code ${code}`}>
        {Array.from(code, (letter, index) => (
          <span key={index} aria-hidden="true" className="invite-plank__tile">{letter}</span>
        ))}
      </p>
      <div className="invite-plank__actions">
        <button type="button" data-testid="invite-plank-copy" className="invite-plank__btn" onClick={() => void copy()}>
          <Copy className="h-4 w-4 shrink-0" aria-hidden />
          <span aria-live="polite">{label}</span>
        </button>
        {canShareInvite() && (
          <button type="button" data-testid="invite-plank-share" className="invite-plank__btn" onClick={() => void share()}>
            <Share2 className="h-4 w-4 shrink-0" aria-hidden />
            <span>Share</span>
          </button>
        )}
      </div>
    </section>
  )
}
