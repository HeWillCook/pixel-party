import { AuthOverlay } from 'deepspace'
import './sign-in.css'

/**
 * The SDK's own sign-in flow (OAuth redirect buttons and the email form: `AuthOverlay`, nothing of the credential
 * handling is ours) laid on a piece of paper in the scene. `sign-in.css` takes the full-screen frosted backdrop and its
 * fades off the SDK's wrapper, so what is left is the card, sitting where its object put it. It empties itself once signed in.
 */
export function SignInCard({ onClose }: { onClose?: () => void }) {
  return (
    <div className="sign-in-card" data-testid="sign-in-card">
      <AuthOverlay onClose={onClose} title="Sign in to paint" description="Your paintings and rooms follow you" />
    </div>
  )
}
