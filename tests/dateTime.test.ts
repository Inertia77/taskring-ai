import { describe, expect, it } from 'vitest'
import { isoToLocalDateTimeValue, localDateTimeToIso } from '../src/data/dateTime'

describe('local datetime conversion', () => {
  it('interprets datetime-local values in the runtime local timezone before writing ISO timestamptz', () => {
    const input = '2030-06-01T09:30'
    expect(localDateTimeToIso(input)).toBe(new Date(2030, 5, 1, 9, 30, 0, 0).toISOString())
  })

  it('round-trips an ISO timestamp through local display fields', () => {
    const iso = new Date(2031, 1, 3, 17, 45, 0, 0).toISOString()
    expect(isoToLocalDateTimeValue(iso)).toBe('2031-02-03T17:45')
  })

  it('rejects normalized invalid calendar input instead of silently changing the date', () => {
    expect(() => localDateTimeToIso('2030-02-31T09:30')).toThrow('valid local date')
  })
})
