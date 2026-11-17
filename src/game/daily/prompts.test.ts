/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DAILY_PROMPTS, promptForDay } from './prompts'

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : []
  })
}

describe('daily prompts', () => {
  it('selects a stable, changing daily prompt', () => {
    expect(promptForDay('2026-11-18')).toEqual(promptForDay('2026-11-18'))
    expect(promptForDay('2026-11-18')).not.toEqual(promptForDay('2026-11-19'))
  })
  it('contains unique prompts and lowercase subjects', () => {
    expect(DAILY_PROMPTS.length).toBeGreaterThanOrEqual(80)
    expect(new Set(DAILY_PROMPTS.map((item) => item.prompt)).size).toBe(DAILY_PROMPTS.length)
    for (const item of DAILY_PROMPTS) expect(item.subject).toMatch(/^[a-z]+$/)
  })
  it('is not imported by client directories', () => {
    for (const directory of ['src/pages', 'src/components', 'src/hooks']) {
      for (const file of filesIn(directory)) expect(readFileSync(file, 'utf8')).not.toMatch(/daily\/prompts/)
    }
  })
})
