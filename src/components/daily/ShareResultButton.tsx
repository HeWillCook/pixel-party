import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Share2 } from 'lucide-react'

/** "Share result": the system share sheet where there is one, else copies the text with a brief "Copied!". */
export function ShareResultButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const share = useCallback(async () => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Dismissing the share sheet (AbortError) or a blocked clipboard is not an error.
    }
  }, [text])
  return (
    <button type="button" data-testid="daily-share-button" className="invite-plank__btn self-start" onClick={() => void share()}>
      {copied ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Share2 className="h-4 w-4 shrink-0" aria-hidden />}
      <span aria-live="polite">{copied ? 'Copied!' : 'Share result'}</span>
    </button>
  )
}
