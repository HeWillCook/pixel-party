/**
 * First-sign-in onboarding: pick a username, then a four-card tour hosted by
 * Haiku. Mounted once in the app shell.
 *
 * It stays out of the way until it can be sure of the answer: only after the
 * profile API has explicitly said the player has no profile (or has not
 * finished onboarding), never while signed out, never during SSR, and never on
 * top of a Daily attempt that is still being painted.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { Haiku } from '../haiku/Haiku'
import { StudioSprite } from '../play/StudioSprite'
import { UsernameForm } from '../profile/UsernameForm'
import { Modal } from '../ui'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { useMyProfile } from '../../hooks/useProfile'
import { suggestUsername } from '../../game/username'
import type { ProfileView } from '../../game/profile'
import { markOnboardingDone } from '../../lib/profile-client'
import { tourIllustrations } from './illustrations'
import './onboarding.css'

interface TourStep {
  title: string
  body: string
  bubble: string
}

const TOUR: TourStep[] = [
  {
    title: 'Daily',
    body: 'One prompt a day on a 32x32 canvas, and the full 5 minutes to paint it. Haiku peeks in at the halfway point with a guess, then gives a final verdict at the end. Your score is mostly how well you matched the prompt, with an art-quality bonus on top.',
    bubble: 'One prompt. Five minutes. No pressure.',
  },
  {
    title: 'Leaderboard',
    body: 'Your best score of the day goes on Scores under your username. Once you have played, tap anyone’s drawing to see it full size. Medals for the top three.',
    bubble: 'Today’s best is already on the board.',
  },
  {
    title: 'Party',
    body: 'Make a room, invite friends with a code, and everyone paints the same canvas live while the AI guesses. Draw it — spelled letters do not count.',
    bubble: 'Bring a friend. Or three.',
  },
  {
    title: 'Gallery',
    body: 'Your past Dailies hang on your wall on the porch. The Gallery sign takes you there whenever you want to look back.',
    bubble: 'Every day hangs on your wall.',
  },
]

export function OnboardingGate() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: false })
  const { status, profile, apply } = useMyProfile()
  const { state: daily } = useDaily()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted || !isSignedIn) return null
  // Wait for both answers the gate depends on: the profile and whether a Daily
  // attempt is already running (a resumed attempt must not be covered).
  if (status !== 'ready' || !daily.loaded) return null
  if (profile?.onboardedAt && profile.onboardedAt > 0) return null
  // A running attempt (and its grading/result moment) owns the screen.
  if (daily.status === 'playing' || daily.grading || daily.finalizing) return null

  return <OnboardingModal profile={profile} onSaved={apply} />
}

function OnboardingModal({ profile, onSaved }: { profile: ProfileView | null; onSaved: (profile: ProfileView) => void }) {
  const navigate = useNavigate()
  const authName = useAuthName()
  const [step, setStep] = useState<'username' | number>(profile ? 0 : 'username')
  const [finishing, setFinishing] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const onTour = typeof step === 'number'
  const tourStep = onTour ? TOUR[step] : null

  useEffect(() => {
    // Each tour card is a fresh context: put focus on it so screen readers and
    // the keyboard start from the card, not from wherever the last one ended.
    if (typeof step === 'number') cardRef.current?.focus()
  }, [step])

  // Belt-and-braces focus trap. Base UI renders focus guards around the popup,
  // but a dialog with a single field (and a temporarily inactive button) is
  // exactly the case where a stray Tab can reach the porch behind it. This
  // listener owns Tab at the dialog's edges and pulls focus back in if it ever
  // escapes (a focus guard included), so the page behind stays unreachable.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const root = document.querySelector<HTMLElement>('[data-testid="onboarding"]')
      if (!root) return
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !root.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  async function finish(navigateHome: boolean) {
    if (finishing) return
    setFinishing(true)
    const result = await markOnboardingDone()
    if (result.ok) onSaved(result.profile)
    else if (profile) onSaved({ ...profile, onboardedAt: Date.now() })
    setFinishing(false)
    if (navigateHome) navigate('/home')
  }

  return (
    <Modal
      open
      onClose={() => { if (onTour) void finish(false) }}
      size="lg"
      hideClose
      className="onboarding-modal"
      aria-label="Welcome to Pixle"
      data-testid="onboarding"
      onKeyDown={(event) => {
        // Username is required: Esc must not dismiss step 1. The tour handles
        // Esc through the dialog's close callback (skip, no navigation).
        if (step === 'username' && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <header className="onboarding__host">
        <Haiku state={step === 'username' ? 'idle' : 'thinking'} scale={2} bubble={step === 'username' ? 'Hi! I’m Haiku.' : tourStep?.bubble} stackBubble />
        <div className="onboarding__head">
          <p className="onboarding__eyebrow">Pixle</p>
          <h2 className="onboarding__title">
            {step === 'username' ? 'Pick a username' : tourStep?.title}
          </h2>
        </div>
      </header>

      {step === 'username' ? (
        <div className="onboarding__body">
          <p className="onboarding__lede">
            Every painter needs a name. This is how you will show up on Scores, on the porch, and on your gallery wall.
          </p>
          <UsernameForm
            initialValue={suggestUsername(authName)}
            submitLabel="That's me"
            autoFocus
            onSaved={(saved) => { onSaved(saved); setStep(0) }}
          />
          <p className="onboarding__skip">You can change it later in Settings.</p>
        </div>
      ) : (
        <>
          <div className="onboarding__body onboarding__body--tour" ref={cardRef} tabIndex={-1} data-testid="onboarding-step" data-step={step}>
            <div className="onboarding__art" aria-hidden="true">
              <StudioSprite sprite={tourIllustrations[step]} scale={5} />
            </div>
            <p className="onboarding__copy">{tourStep?.body}</p>
          </div>
          <div className="onboarding__dots" role="group" aria-label="Tour steps">
            {TOUR.map((tour, index) => (
              <button
                key={tour.title}
                type="button"
                className="onboarding__dot"
                data-active={index === step || undefined}
                aria-label={`Step ${index + 1} of ${TOUR.length}: ${tour.title}`}
                aria-current={index === step ? 'step' : undefined}
                onClick={() => setStep(index)}
              />
            ))}
          </div>
          <footer className="onboarding__footer">
            <button type="button" className="pp-btn onboarding__skip-btn" onClick={() => void finish(false)} disabled={finishing}>
              Skip tour
            </button>
            <div className="onboarding__nav">
              <button
                type="button"
                className="pp-btn onboarding__nav-btn"
                onClick={() => setStep((current) => typeof current === 'number' && current > 0 ? current - 1 : 0)}
                disabled={step === 0 || finishing}
              >
                Back
              </button>
              <button
                type="button"
                className="pp-btn onboarding__nav-btn onboarding__nav-btn--next"
                onClick={() => {
                  if (typeof step !== 'number') return
                  if (step < TOUR.length - 1) setStep(step + 1)
                  else void finish(true)
                }}
                disabled={finishing}
              >
                {step === TOUR.length - 1 ? (finishing ? 'Saving…' : 'Finish') : 'Next'}
              </button>
            </div>
          </footer>
        </>
      )}
    </Modal>
  )
}

/** The sign-in name, used only for the picker's first suggestion. */
function useAuthName(): string {
  const { user } = useAuthProfileReady({ requireUser: false })
  return user?.name || user?.email || ''
}
