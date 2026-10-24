import { describe, expect, it } from 'vitest'
import { formatLocalDate, localDateAt, monthDates, movePeriod, weekDates, yearDates } from './dates'

describe('calendar dates', () => {
  it('derives calendar dates in the configured timezone, including midnight rollover', () => {
    expect(localDateAt(Date.UTC(2026, 9, 24, 18, 20), 'Asia/Kolkata')).toBe('2026-10-24')
    expect(localDateAt(Date.UTC(2026, 9, 24, 19, 0), 'Asia/Kolkata')).toBe('2026-10-25')
    expect(formatLocalDate('2024-03-10', 'EEEE d MMMM', 'America/New_York')).toBe('Sunday 10 March')
  })

  it('builds configurable Monday-start weeks and complete month grids', () => {
    expect(weekDates('2026-10-24', 1)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(weekDates('2026-10-24', 0)[0]).toBe('2026-10-18')
    const february = monthDates('2024-02-18')
    expect(february).toHaveLength(35)
    expect(february).toContain('2024-02-29')
  })

  it('handles leap years and period boundaries', () => {
    expect(yearDates(2024)).toHaveLength(366)
    expect(yearDates(2025)).toHaveLength(365)
    expect(movePeriod('2024-12-31', 'year', 1)).toBe('2025-12-31')
    expect(movePeriod('2025-01-31', 'month', 1)).toBe('2025-02-28')
  })
})
