/**
 * Gated routes. Any file under src/pages/(app)/(protected)/ requires sign-in.
 * The `(protected)` folder is a Generouted route group — parentheses mean
 * it doesn't appear in the URL. For a dynamic page that does NOT require
 * sign-in, put it directly under src/pages/(app)/; for a static page, put it
 * at the top level of src/pages/.
 *
 * Children may call data hooks like `useUser()` safely because the parent
 * (app)/_layout.tsx mounts <RecordProvider> above this layout.
 *
 * The `fallback` keeps signed-out visitors inside the app's own chrome (without it, AuthGate shows the SDK's
 * full-screen, non-dismissible overlay): the SDK's sign-in form sits right on the panel, no pop-up.
 */

import { Link, Outlet } from 'react-router-dom'
import { AuthGate } from 'deepspace'
import { SignInCard } from '@/components/auth/SignInCard'

export default function ProtectedLayout() {
  return (
    <AuthGate fallback={<SignedOutPanel />}>
      <Outlet />
    </AuthGate>
  )
}

function SignedOutPanel() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <div className="pp-wood-panel w-full max-w-sm p-8 text-center">
        <h1 className="text-2xl uppercase text-[var(--sunset-2)]">Sign in to continue</h1>
        <p className="mt-2 text-base text-muted-foreground">
          This page is only available to signed-in users.
        </p>
        <div className="mt-6 text-left">
          <SignInCard />
        </div>
        <Link
          to="/"
          className="mt-4 inline-block text-base uppercase text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>
      </div>

    </div>
  )
}
