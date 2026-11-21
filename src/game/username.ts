/**
 * Usernames: the one shared, pure rule set for both the browser and the worker.
 *
 * A player picks a username on first sign-in instead of appearing under their
 * OAuth provider's name. This module owns the shape (3-16 characters), the
 * case-insensitive uniqueness key, the reserved list, the profanity check and
 * the user-facing messages. The server is still the authority: it re-runs
 * `validateUsername` and enforces uniqueness; the client uses the same function
 * for instant feedback so the two can never drift.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 16

/** Letters, digits, `_` and `-`, and the first character must be a letter or digit. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export type UsernameErrorCode =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'invalid_start'
  | 'reserved'
  | 'profane'
  | 'taken'
  | 'rate_limited'
  | 'no_profile'
  | 'unknown'

export const USERNAME_MESSAGES: Record<UsernameErrorCode, string> = {
  required: 'Pick a username to keep going',
  too_short: 'At least 3 characters',
  too_long: '16 characters at most',
  invalid_chars: 'Letters, numbers, _ and - only',
  invalid_start: 'Start with a letter or number',
  reserved: "That one's reserved - pick another",
  profane: "Let's pick something friendlier",
  taken: "That name's taken",
  rate_limited: 'You can change your username once a day',
  no_profile: 'Pick a username first',
  unknown: 'Something went wrong - try again',
}

export interface UsernameAccepted {
  ok: true
  /** The name as typed, trimmed. This is what other players see. */
  username: string
  /** The lowercase key used for case-insensitive uniqueness. */
  key: string
}

export interface UsernameRejected {
  ok: false
  code: UsernameErrorCode
  message: string
}

export type UsernameCheck = UsernameAccepted | UsernameRejected

/** Names nobody may take, compared against the lowercase key. */
const RESERVED = new Set([
  'admin', 'administrator', 'admins', 'mod', 'mods', 'moderator', 'moderators', 'owner', 'staff',
  'system', 'support', 'help', 'helpdesk', 'official', 'pixle', 'pixel', 'pixels', 'haiku', 'deepspace',
  'anonymous', 'anon', 'guest', 'player', 'players', 'painter', 'painters', 'artist', 'artists',
  'null', 'undefined', 'nil', 'none', 'root', 'bot', 'bots', 'ai', 'claude', 'test', 'testing',
  'dev', 'developer', 'api', 'app', 'home', 'scores', 'party', 'gallery', 'daily', 'settings',
  'signin', 'signup', 'login', 'logout', 'account', 'profile', 'me', 'you', 'everyone', 'team', 'mail',
])

/**
 * The worst terms, checked as substrings of the normalized form: they are long
 * enough that innocent words rarely contain them, and leetspeak/separators must
 * not be a way around them. Shorter terms are matched exactly (below) so
 * "class" or "spices" is not blocked by a three- or four-letter fragment.
 */
const PROFANITY_SUBSTRINGS = [
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'wetback', 'raghead', 'towelhead',
  'asshole', 'bastard', 'bitch', 'cunt', 'fuck', 'shit', 'whore', 'slut', 'nazi',
  'hitler', 'porn', 'dildo', 'shemale',
]

/** Short or easily-embedded terms: the whole normalized name must equal one. */
const PROFANITY_EXACT = new Set([
  'ass', 'fag', 'dyke', 'spic', 'chink', 'gook', 'coon', 'paki', 'wop', 'kike', 'homo',
  'cum', 'dick', 'cock', 'pussy', 'twat', 'prick', 'wanker', 'bollocks', 'bugger',
  'penis', 'vagina', 'rape', 'kkk',
])

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
}

/** The uniqueness key: trimmed and lowercased, so `Will` and `will` collide. */
export function normalizeUsernameKey(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * The form the blocklist checks: lowercase, leetspeak folded, and `_`/`-`
 * (plus every other separator) stripped, so `F_u_c_k`, `sh1t` and `@sshole`
 * still read as the words they are.
 */
export function normalizeForProfanity(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[013457@$]/g, (character) => LEET[character] ?? character)
    .replace(/[^a-z0-9]/g, '')
}

export function containsProfanity(raw: string): boolean {
  const normalized = normalizeForProfanity(raw)
  if (!normalized) return false
  if (PROFANITY_EXACT.has(normalized)) return true
  return PROFANITY_SUBSTRINGS.some((term) => normalized.includes(term))
}

/** Validate a username as typed. The returned `username` is trimmed, never rewritten. */
export function validateUsername(raw: unknown): UsernameCheck {
  const username = typeof raw === 'string' ? raw.trim() : ''
  const reject = (code: UsernameErrorCode): UsernameRejected => ({ ok: false, code, message: USERNAME_MESSAGES[code] })

  if (!username) return reject('required')
  if (username.length < USERNAME_MIN_LENGTH) return reject('too_short')
  if (username.length > USERNAME_MAX_LENGTH) return reject('too_long')
  if (!/^[A-Za-z0-9]/.test(username)) return reject('invalid_start')
  if (!USERNAME_PATTERN.test(username)) return reject('invalid_chars')

  const key = normalizeUsernameKey(username)
  if (RESERVED.has(key)) return reject('reserved')
  if (containsProfanity(username)) return reject('profane')
  return { ok: true, username, key }
}

/**
 * A first guess for the picker, from the sign-in name (or an email's local
 * part): accents folded, words joined, anything outside the allowed alphabet
 * dropped, and cut to the maximum length. Returns `''` when nothing usable is
 * left, so the field simply starts empty.
 */
export function suggestUsername(source: string): string {
  const input = source.trim()
  if (!input) return ''
  const localPart = input.includes('@') ? input.slice(0, input.indexOf('@')) : input
  const ascii = localPart.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const cleaned = ascii
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .join('')
  const candidate = cleaned.slice(0, USERNAME_MAX_LENGTH)
  return candidate.length >= USERNAME_MIN_LENGTH ? candidate : ''
}
