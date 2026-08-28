import { describe, expect, it } from 'vitest'
import { planDateForInstant } from '../src/data/planningDate'

describe('planning date timezone semantics', () => {
  it('resolves the same instant to different local calendar dates', () => {
    const instant = new Date('2026-08-28T00:30:00.000Z')

    expect(planDateForInstant(instant, 'Asia/Tokyo')).toBe('2026-08-28')
    expect(planDateForInstant(instant, 'America/Los_Angeles')).toBe('2026-08-27')
  })

  it('does not use the UTC ISO date as the planning date shortcut', () => {
    const instant = new Date('2026-08-28T00:30:00.000Z')
    const utcShortcut = instant.toISOString().slice(0, 10)

    expect(utcShortcut).toBe('2026-08-28')
    expect(planDateForInstant(instant, 'America/Los_Angeles')).not.toBe(utcShortcut)
  })
})
