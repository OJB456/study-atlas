import { describe, expect, it } from 'vitest'
import { formatDurationAdaptive, formatTimerSeconds, parseDurationSeconds, parseQuickAddTask } from './durations'

describe('duration parsing', () => {
  it.each([
    ['0', 'minutes', 0], ['59s', 'minutes', 59], ['60s', 'minutes', 60], ['3599s', 'minutes', 3599],
    ['3600s', 'minutes', 3600], ['24h', 'minutes', 86400], ['1h30m', 'minutes', 5400],
    ['90s', 'minutes', 90], ['25m', 'minutes', 1500], ['1:30:00', 'minutes', 5400],
    ['1:30', 'minutes', 90], ['2.5', 'hours', 9000],
  ] as const)('parses %s', (input, unit, expected) => expect(parseDurationSeconds(input, unit)).toBe(expected))

  it('rejects malformed time and accepts a blank as missing', () => {
    expect(parseDurationSeconds('')).toBeNull()
    expect(parseDurationSeconds('1:75')).toBeNull()
    expect(parseDurationSeconds('2x')).toBeNull()
  })
})

describe('duration formatting', () => {
  it.each([[0, '0s'], [59, '59s'], [60, '1m'], [3599, '59m 59s'], [3600, '1h'], [5400, '1h 30m'], [86401, '24h']])('formats %i seconds', (input, expected) => expect(formatDurationAdaptive(input)).toBe(expected))
  it('supports timer display formats', () => {
    expect(formatTimerSeconds(90, 'mm:ss')).toBe('01:30')
    expect(formatTimerSeconds(3661, 'hh:mm:ss')).toBe('01:01:01')
    expect(formatTimerSeconds(90, 'adaptive')).toBe('01:30')
    expect(formatTimerSeconds(3600, 'adaptive')).toBe('01:00:00')
  })
})

describe('quick add parsing', () => {
  it.each([
    ['DSA 45m', 'DSA', 2700, undefined],
    ['read paper 1h', 'read paper', 3600, undefined],
    ['aptitude 30 every weekday', 'aptitude', 1800, [1, 2, 3, 4, 5]],
    ['pushups 90s', 'pushups', 90, undefined],
  ] as const)('parses %s', (input, name, seconds, weekdays) => {
    expect(parseQuickAddTask(input)).toEqual({ name, seconds, ...(weekdays ? { weekdays } : {}) })
  })
})
