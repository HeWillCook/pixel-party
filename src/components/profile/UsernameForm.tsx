/**
 * The one username input, shared by first-sign-in onboarding and Settings.
 * Local validation is the same pure module the worker runs; the debounced
 * availability check is a convenience on top of the server's real check.
 */

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { USERNAME_MAX_LENGTH, USERNAME_MESSAGES, normalizeUsernameKey, validateUsername } from '../../game/username'
import type { ProfileView } from '../../game/profile'
import { checkUsername, saveMyUsername } from '../../lib/profile-client'
import './username-form.css'

type Availability =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'error'; code: string; message: string }

export interface UsernameFormProps {
  initialValue?: string
  currentUsername?: string | null
  submitLabel: string
  /** Small line under the field; settings uses it to explain the 24 h limit. */
  hint?: string
  autoFocus?: boolean
  /** One row (input + button) for a settings row, instead of the onboarding stack. */
  compact?: boolean
  onSaved: (profile: ProfileView) => void
}

export function UsernameForm({
  initialValue = '',
  currentUsername = null,
  submitLabel,
  hint,
  autoFocus = false,
  compact = false,
  onSaved,
}: UsernameFormProps) {
  const inputId = useId()
  const statusId = `${inputId}-status`
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(false)
  const [availability, setAvailability] = useState<Availability>({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // The profile often answers after the first render (Settings): until the player types, follow it,
  // so the field shows their current name instead of an empty, "invalid" box.
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (!edited) setValue(initialValue)
  }, [initialValue, edited])

  const validation = useMemo(() => validateUsername(value), [value])
  // The key changes only when the meaning changes, so typing trailing spaces
  // or a case variant does not restart the debounce for no reason.
  const validationKey = validation.ok ? validation.key : ''
  const validationName = validation.ok ? validation.username : ''

  useEffect(() => {
    if (!validation.ok) {
      setAvailability({ status: 'idle' })
      return
    }
    if (currentUsername && normalizeUsernameKey(currentUsername) === validation.key) {
      setAvailability({ status: 'ok' })
      return
    }
    let cancelled = false
    setAvailability({ status: 'checking' })
    const timer = window.setTimeout(() => {
      void checkUsername(validationName)
        .then((result) => {
          if (cancelled) return
          if (result.available) setAvailability({ status: 'ok' })
          else setAvailability({ status: 'error', code: result.code, message: result.message })
        })
        .catch(() => {
          if (cancelled) return
          // The server is still the authority: a failed check must not block a
          // submit (it will answer `taken` if the name really is gone).
          setAvailability({ status: 'error', code: 'unknown', message: "Couldn't check that name - you can still try" })
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [validationKey, validationName, currentUsername, validation.ok])

  const knownBad = availability.status === 'error' && availability.code !== 'unknown'
  // Ready only after a positive answer (or an unreachable check, where the
  // server's answer on submit is the final word).
  const checkedIn = availability.status === 'ok' || (availability.status === 'error' && availability.code === 'unknown')
  // Settings: re-saving the name you already have is not a change.
  const unchanged = Boolean(currentUsername) && validation.ok && validation.username === currentUsername
  const canSubmit = validation.ok && checkedIn && !knownBad && !submitting && !unchanged

  const message = !validation.ok
    ? validation.message
    : availability.status === 'checking'
      ? 'Checking that name…'
      : availability.status === 'ok'
        ? unchanged ? 'Your current name' : 'Available'
        : availability.status === 'error'
          ? availability.message
          : null

  const messageTone = (!validation.ok && (touched || value.length > 0)) || knownBad ? 'error' : availability.status === 'ok' ? 'ok' : 'idle'
  const showMessage = !validation.ok ? touched || value.length > 0 : Boolean(message)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setSubmitError(null)
    if (!canSubmit || !validation.ok) return
    setSubmitting(true)
    const result = await saveMyUsername(validation.username)
    setSubmitting(false)
    if (result.ok) {
      onSaved(result.profile)
      return
    }
    setSubmitError(result.message)
    if (result.code === 'taken') setAvailability({ status: 'error', code: 'taken', message: USERNAME_MESSAGES.taken })
  }

  const field = (
    <input
      id={inputId}
      data-testid="username-input"
      className="username-form__input"
      value={value}
      onChange={(event) => { setEdited(true); setValue(event.target.value); setSubmitError(null) }}
      onBlur={() => setTouched(true)}
      maxLength={USERNAME_MAX_LENGTH + 8}
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={autoFocus}
      aria-invalid={(!validation.ok && (touched || value.length > 0)) || knownBad || undefined}
      aria-describedby={statusId}
    />
  )
  const button = (
    // aria-disabled rather than disabled: the button stays in the tab order so
    // a dialog with one field still has somewhere to move focus to, and the
    // form handler refuses the submit while it is inactive.
    <button
      type="submit"
      className="pp-btn username-form__submit"
      aria-disabled={!canSubmit || undefined}
      data-testid="username-submit"
      onClick={(event) => { if (!canSubmit) event.preventDefault() }}
    >
      {submitting ? 'Saving…' : submitLabel}
    </button>
  )
  const status = (
    <p
      id={statusId}
      className={`username-form__status username-form__status--${messageTone}`}
      data-testid="username-status"
      aria-live="polite"
    >
      {showMessage ? message : (hint ?? '')}
    </p>
  )

  return (
    <form className={compact ? 'username-form username-form--compact' : 'username-form'} onSubmit={submit} noValidate>
      {compact ? (
        <div className="username-form__row">
          <label htmlFor={inputId} className="sr-only">Username</label>
          {field}
          {button}
        </div>
      ) : (
        <>
          <label htmlFor={inputId} className="username-form__label">Username</label>
          {field}
          {/* The name's check and the rules belong to the field, so they sit under it, above the button. */}
          {status}
          <p className="username-form__rules">
            3-16 characters. Letters, numbers, _ and -.
          </p>
          {submitError && submitError !== message && (
            <p className="username-form__status username-form__status--error" role="alert" data-testid="username-submit-error">
              {submitError}
            </p>
          )}
          {button}
        </>
      )}
      {compact && status}
      {compact && submitError && submitError !== message && (
        <p className="username-form__status username-form__status--error" role="alert" data-testid="username-submit-error">
          {submitError}
        </p>
      )}
    </form>
  )
}
