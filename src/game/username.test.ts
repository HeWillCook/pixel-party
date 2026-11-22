import { describe, expect, it } from 'vitest'
import {
  USERNAME_MESSAGES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  containsProfanity,
  normalizeForProfanity,
  normalizeUsernameKey,
  suggestUsername,
  validateUsername,
} from './username'

describe('validateUsername', () => {
  it.each(['Will', 'will_99', 'a-b-c', 'Pixel3', 'xYz', 'A'.repeat(USERNAME_MAX_LENGTH)])('accepts %s', (name) => {
    const check = validateUsername(name)
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.username).toBe(name)
      expect(check.key).toBe(name.toLowerCase())
    }
  })

  it('trims surrounding whitespace without rewriting the name', () => {
    expect(validateUsername('  Will  ')).toEqual({ ok: true, username: 'Will', key: 'will' })
  })

  it.each([undefined, null, 42, {}, [], ''])('requires a non-empty string: %j', (value) => {
    expect(validateUsername(value)).toEqual({ ok: false, code: 'required', message: USERNAME_MESSAGES.required })
  })

  it('enforces the length bounds', () => {
    expect(validateUsername('ab')).toMatchObject({ ok: false, code: 'too_short' })
    expect(validateUsername('a'.repeat(USERNAME_MIN_LENGTH))).toMatchObject({ ok: true })
    expect(validateUsername('a'.repeat(USERNAME_MAX_LENGTH + 1))).toMatchObject({ ok: false, code: 'too_long' })
  })

  it('rejects unsupported characters with the friendly message', () => {
    for (const name of ['Will Cook', 'will.cook', 'will@home', 'will!', 'café', '画伯画伯', 'emoji😀']) {
      const check = validateUsername(name)
      expect(check).toMatchObject({ ok: false })
      if (!check.ok) expect(['invalid_chars', 'invalid_start']).toContain(check.code)
    }
    expect(validateUsername('Will Cook')).toEqual({ ok: false, code: 'invalid_chars', message: 'Letters, numbers, _ and - only' })
  })

  it('requires the first character to be a letter or digit', () => {
    expect(validateUsername('_will')).toEqual({ ok: false, code: 'invalid_start', message: 'Start with a letter or number' })
    expect(validateUsername('-will')).toEqual({ ok: false, code: 'invalid_start', message: 'Start with a letter or number' })
    expect(validateUsername('😀ab')).toMatchObject({ ok: false, code: 'invalid_start' })
  })

  it.each(['admin', 'Admin', 'ADMIN', 'mod', 'moderator', 'haiku', 'Haiku', 'pixle', 'system', 'staff', 'support', 'anonymous', 'player', 'painter', 'null', 'undefined'])(
    'reserves %s',
    (name) => {
      expect(validateUsername(name)).toEqual({ ok: false, code: 'reserved', message: USERNAME_MESSAGES.reserved })
    },
  )

  it('matches uniqueness case-insensitively', () => {
    const first = validateUsername('Will')
    const second = validateUsername('wILL')
    expect(first.ok && second.ok && first.key === second.key).toBe(true)
  })

  it.each(['fuck', 'FUCK', 'sh1t', 'F_u_c_k', 'fuckyou', 'xxfuckxx', 'a55hole', 'n1gger', 'f4ggot', 'b1tch', 'nazi'])(
    'blocks profanity and leetspeak: %s',
    (name) => {
      // Trim each fixture into the allowed length first.
      const candidate = name.slice(0, USERNAME_MAX_LENGTH)
      expect(validateUsername(candidate)).toMatchObject({ ok: false, code: 'profane' })
    },
  )

  it('does not block innocent words that merely contain a short fragment', () => {
    for (const name of ['class', 'spices', 'assist', 'shell', 'shiitake', 'grape', 'cooper']) {
      expect(validateUsername(name).ok).toBe(true)
    }
  })

  it('returns the exact friendly message per code', () => {
    expect(USERNAME_MESSAGES.taken).toBe("That name's taken")
    expect(USERNAME_MESSAGES.invalid_chars).toBe('Letters, numbers, _ and - only')
    expect(USERNAME_MESSAGES.profane).toBe("Let's pick something friendlier")
  })
})

describe('normalization', () => {
  it('keys names case-insensitively and trimmed', () => {
    expect(normalizeUsernameKey('  Will ')).toBe('will')
    expect(normalizeUsernameKey('WILL')).toBe(normalizeUsernameKey('will'))
  })

  it('folds leetspeak and strips separators for the blocklist', () => {
    expect(normalizeForProfanity('F_u-c_k')).toBe('fuck')
    expect(normalizeForProfanity('sh1t')).toBe('shit')
    expect(normalizeForProfanity('@$$hole')).toBe('asshole')
    expect(normalizeForProfanity('N4ZI')).toBe('nazi')
  })

  it('checks both substring and exact terms', () => {
    expect(containsProfanity('hello f_u_c_k world')).toBe(true)
    expect(containsProfanity('ass')).toBe(true)
    expect(containsProfanity('class')).toBe(false)
    expect(containsProfanity('will')).toBe(false)
  })
})

describe('suggestUsername', () => {
  it('joins the words of a sign-in name', () => {
    expect(suggestUsername('Will Cook')).toBe('WillCook')
    expect(suggestUsername('  Ana-Maria  ')).toBe('AnaMaria')
  })

  it('folds accents', () => {
    expect(suggestUsername('José Álvarez')).toBe('JoseAlvarez')
  })

  it('uses the local part of an email address', () => {
    expect(suggestUsername('will.cook@example.com')).toBe('willcook')
  })

  it('respects the maximum length', () => {
    expect(suggestUsername('a'.repeat(40))).toHaveLength(USERNAME_MAX_LENGTH)
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(suggestUsername('')).toBe('')
    expect(suggestUsername('a')).toBe('')
    expect(suggestUsername('!!!')).toBe('')
  })
})
