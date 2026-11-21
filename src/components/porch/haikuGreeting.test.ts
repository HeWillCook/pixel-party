import { describe, expect, it } from 'vitest'
import { HAIKU_INTRO, haikuGreeting } from './haikuGreeting'

describe('haikuGreeting', () => {
  it('introduces himself the first time, whatever he knows', () => {
    expect(haikuGreeting({ top: 900, yesterday: 812 }, 0)).toBe(HAIKU_INTRO)
    expect(HAIKU_INTRO).toBe("Hi, I'm Haiku. I judge the Daily.")
  })

  it('then goes round what there is to say', () => {
    const facts = { best: 640, yesterday: 812, top: 905 }
    const lines = [1, 2, 3, 4].map((visit) => haikuGreeting(facts, visit))
    expect(lines[0]).toBe('You got 640 today. Nice painting!')
    expect(lines[1]).toBe('Your painting from yesterday got 812!')
    expect(lines[2]).toBe("Today's top score is 905. Can you beat it?")
    expect(lines[3]).toBe(lines[0])
  })

  it('has a friendly line when there is nothing to report', () => {
    expect(haikuGreeting({}, 1)).toMatch(/Welcome back/)
    expect(haikuGreeting({ top: 0, yesterday: 0, best: 0 }, 7)).toMatch(/Welcome back/)
  })
})
