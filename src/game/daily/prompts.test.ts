/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DAILY_PROMPTS, promptForDay, type DailyPrompt } from './prompts'

const DAY_MS = 86_400_000

/**
 * The ORIGINAL implementation, frozen here as a snapshot. `promptForDay` must
 * keep returning exactly these values through 2026-11-22: players may be
 * mid-attempt and history references past prompts.
 */
const ORIGINAL_PROMPTS: readonly DailyPrompt[] = [
  { prompt: 'a lighthouse in a storm', subject: 'lighthouse' },
  { prompt: 'a cat sleeping in a teacup', subject: 'cat' },
  { prompt: 'a fox under a mushroom', subject: 'fox' },
  { prompt: 'a whale beneath a sailboat', subject: 'whale' },
  { prompt: 'a robot watering a flower', subject: 'robot' },
  { prompt: 'a turtle carrying a garden', subject: 'turtle' },
  { prompt: 'a penguin wearing a scarf', subject: 'penguin' },
  { prompt: 'a moon above snowy mountains', subject: 'moon' },
  { prompt: 'a frog sitting on a lily pad', subject: 'frog' },
  { prompt: 'a snail with a striped shell', subject: 'snail' },
  { prompt: 'a bee beside a sunflower', subject: 'bee' },
  { prompt: 'a castle on a cloud', subject: 'castle' },
  { prompt: 'a rocket passing a ringed planet', subject: 'rocket' },
  { prompt: 'a cactus in a spotted pot', subject: 'cactus' },
  { prompt: 'a duck in a rain puddle', subject: 'duck' },
  { prompt: 'a barn beneath a rainbow', subject: 'barn' },
  { prompt: 'a rabbit peeking from a hat', subject: 'rabbit' },
  { prompt: 'a fish swimming past coral', subject: 'fish' },
  { prompt: 'a lantern hanging from a branch', subject: 'lantern' },
  { prompt: 'a squirrel holding an acorn', subject: 'squirrel' },
  { prompt: 'a bicycle beside a tree', subject: 'bicycle' },
  { prompt: 'an owl on a snowy branch', subject: 'owl' },
  { prompt: 'a ship inside a bottle', subject: 'ship' },
  { prompt: 'a dragon flying over a hill', subject: 'dragon' },
  { prompt: 'a hedgehog carrying an apple', subject: 'hedgehog' },
  { prompt: 'a tent beneath the stars', subject: 'tent' },
  { prompt: 'a koala hugging a tree', subject: 'koala' },
  { prompt: 'a cupcake with a cherry', subject: 'cupcake' },
  { prompt: 'a crab beside a sandcastle', subject: 'crab' },
  { prompt: 'a train crossing a bridge', subject: 'train' },
  { prompt: 'a bat hanging from a cave', subject: 'bat' },
  { prompt: 'a jellyfish among bubbles', subject: 'jellyfish' },
  { prompt: 'a windmill in a field of flowers', subject: 'windmill' },
  { prompt: 'a panda eating bamboo', subject: 'panda' },
  { prompt: 'a crown on a cushion', subject: 'crown' },
  { prompt: 'a bear holding a honey pot', subject: 'bear' },
  { prompt: 'a volcano on an island', subject: 'volcano' },
  { prompt: 'a kite above a hill', subject: 'kite' },
  { prompt: 'a mouse beside a wedge of cheese', subject: 'mouse' },
  { prompt: 'a sailboat at sunset', subject: 'sailboat' },
  { prompt: 'a butterfly on a leaf', subject: 'butterfly' },
  { prompt: 'a pizza with three mushrooms', subject: 'pizza' },
  { prompt: 'a ghost holding a balloon', subject: 'ghost' },
  { prompt: 'a teapot pouring into a cup', subject: 'teapot' },
  { prompt: 'a flamingo standing in water', subject: 'flamingo' },
  { prompt: 'a house with a red door', subject: 'house' },
  { prompt: 'a horse jumping over a fence', subject: 'horse' },
  { prompt: 'a star reflected in a pond', subject: 'star' },
  { prompt: 'a ladybug on a daisy', subject: 'ladybug' },
  { prompt: 'a snowman with a carrot nose', subject: 'snowman' },
  { prompt: 'an octopus holding a shell', subject: 'octopus' },
  { prompt: 'a clock above a fireplace', subject: 'clock' },
  { prompt: 'a parrot on a pirate hat', subject: 'parrot' },
  { prompt: 'a balloon tied to a gift', subject: 'balloon' },
  { prompt: 'a goat on a rocky hill', subject: 'goat' },
  { prompt: 'a pumpkin with a green bow', subject: 'pumpkin' },
  { prompt: 'a cloud raining on a flower', subject: 'cloud' },
  { prompt: 'a dog chasing a ball', subject: 'dog' },
  { prompt: 'a candle beside an open book', subject: 'candle' },
  { prompt: 'a dolphin leaping over a wave', subject: 'dolphin' },
  { prompt: 'a tree with a birdhouse', subject: 'tree' },
  { prompt: 'a crown resting on a pumpkin', subject: 'crown' },
  { prompt: 'a rooster on a fence', subject: 'rooster' },
  { prompt: 'a submarine near a treasure chest', subject: 'submarine' },
  { prompt: 'a raccoon inside a box', subject: 'raccoon' },
  { prompt: 'a mitten covered in snowflakes', subject: 'mitten' },
  { prompt: 'a giraffe reaching for leaves', subject: 'giraffe' },
  { prompt: 'a bridge over a river', subject: 'bridge' },
  { prompt: 'a seal balancing a ball', subject: 'seal' },
  { prompt: 'an umbrella in the rain', subject: 'umbrella' },
  { prompt: 'a sheep beside a haystack', subject: 'sheep' },
  { prompt: 'a key beside a locked chest', subject: 'key' },
  { prompt: 'a peacock displaying its tail', subject: 'peacock' },
  { prompt: 'a boot filled with flowers', subject: 'boot' },
  { prompt: 'a caterpillar on an apple', subject: 'caterpillar' },
  { prompt: 'a cabin in a snowy forest', subject: 'cabin' },
  { prompt: 'a seahorse beside seaweed', subject: 'seahorse' },
  { prompt: 'a toaster popping up toast', subject: 'toaster' },
  { prompt: 'a kangaroo carrying a joey', subject: 'kangaroo' },
  { prompt: 'a pineapple wearing sunglasses', subject: 'pineapple' },
  { prompt: 'a pot of gold under a rainbow', subject: 'pot' },
  { prompt: 'a turkey wearing a bow tie', subject: 'turkey' },
  { prompt: 'a bucket and shovel on a beach', subject: 'bucket' },
  { prompt: 'a zebra beside a watering hole', subject: 'zebra' },
]

const originalShuffled = [...ORIGINAL_PROMPTS]
let originalSeed = 0x12345678
for (let index = originalShuffled.length - 1; index > 0; index--) {
  originalSeed = (Math.imul(originalSeed, 1664525) + 1013904223) >>> 0
  const swap = originalSeed % (index + 1)
  ;[originalShuffled[index], originalShuffled[swap]] = [originalShuffled[swap], originalShuffled[index]]
}

function originalPromptForDay(day: string): DailyPrompt {
  const days = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
  return originalShuffled[((days % originalShuffled.length) + originalShuffled.length) % originalShuffled.length]
}

function dayAt(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

const ROTATION_START_MS = Date.UTC(2026, 10, 23)

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : []
  })
}

describe('daily prompts', () => {
  it('keeps the original prompt for every day through 2026-11-22', () => {
    const days: string[] = []
    for (let time = Date.UTC(2024, 0, 1); time <= Date.UTC(2026, 10, 22); time += DAY_MS) days.push(dayAt(time))
    expect(days).toHaveLength(1057)
    expect(days.map((day) => promptForDay(day))).toEqual(days.map((day) => originalPromptForDay(day)))
    expect(promptForDay('2026-11-22')).toEqual(originalPromptForDay('2026-11-22'))
  })

  it('freezes the legacy list ahead of the added prompts', () => {
    expect(DAILY_PROMPTS.slice(0, ORIGINAL_PROMPTS.length)).toEqual(ORIGINAL_PROMPTS)
    expect(DAILY_PROMPTS.length).toBeGreaterThanOrEqual(290)
  })

  it('starts the new rotation after the cutoff without repeating the day before', () => {
    expect(promptForDay('2026-11-23')).not.toEqual(promptForDay('2026-11-22'))
  })

  it('uses every prompt exactly once per rotation cycle', () => {
    const counts = new Map<string, number>()
    for (let index = 0; index < DAILY_PROMPTS.length; index++) {
      const prompt = promptForDay(dayAt(ROTATION_START_MS + index * DAY_MS)).prompt
      counts.set(prompt, (counts.get(prompt) ?? 0) + 1)
    }
    expect(counts.size).toBe(DAILY_PROMPTS.length)
    expect([...counts.values()].every((count) => count === 1)).toBe(true)
  })

  it('never repeats a subject within any 60-day window of the new cycle', () => {
    const subjects: string[] = []
    for (let index = 0; index < DAILY_PROMPTS.length + 59; index++) {
      subjects.push(promptForDay(dayAt(ROTATION_START_MS + index * DAY_MS)).subject)
    }
    const repeats: string[] = []
    for (let start = 0; start + 60 <= subjects.length; start++) {
      const seen = new Set<string>()
      for (const subject of subjects.slice(start, start + 60)) {
        if (seen.has(subject)) {
          repeats.push(`${dayAt(ROTATION_START_MS + start * DAY_MS)}: ${subject}`)
          break
        }
        seen.add(subject)
      }
    }
    expect(repeats).toEqual([])
  })

  it('has unique, short, lowercase prompts', () => {
    expect(new Set(DAILY_PROMPTS.map((item) => item.prompt)).size).toBe(DAILY_PROMPTS.length)
    for (const item of DAILY_PROMPTS) {
      expect(item.subject).toMatch(/^[a-z]+$/)
      // A short prompt keeps the longest caption inside the gallery card.
      expect(item.prompt.length).toBeLessThanOrEqual(33)
    }
  })

  it('selects a stable, changing daily prompt', () => {
    expect(promptForDay('2026-11-18')).toEqual(promptForDay('2026-11-18'))
    expect(promptForDay('2026-11-18')).not.toEqual(promptForDay('2026-11-19'))
  })

  it('is not imported by client directories', () => {
    for (const directory of ['src/pages', 'src/components', 'src/hooks']) {
      for (const file of filesIn(directory)) expect(readFileSync(file, 'utf8')).not.toMatch(/daily\/prompts/)
    }
  })
})
