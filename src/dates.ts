import { addDays, addMonths, addYears, format, getDay, getDaysInMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export function localDateAt(instant: Date | number, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd')
}

export function dateAtNoon(localDate: string, timezone: string): Date {
  return fromZonedTime(`${localDate}T12:00:00`, timezone)
}

export function formatLocalDate(localDate: string, pattern: string, timezone: string): string {
  return formatInTimeZone(dateAtNoon(localDate, timezone), timezone, pattern)
}

export function shiftDate(localDate: string, amount: number): string {
  return format(addDays(parseISO(`${localDate}T12:00:00`), amount), 'yyyy-MM-dd')
}

export function weekdayFor(localDate: string): number {
  return getDay(parseISO(`${localDate}T12:00:00`))
}

export function weekDates(localDate: string, weekStartsOn: 0 | 1): string[] {
  const first = startOfWeek(parseISO(`${localDate}T12:00:00`), { weekStartsOn })
  return Array.from({ length: 7 }, (_, index) => format(addDays(first, index), 'yyyy-MM-dd'))
}

export function monthDates(localDate: string): string[] {
  const monthStart = startOfMonth(parseISO(`${localDate}T12:00:00`))
  const leading = (getDay(monthStart) + 6) % 7
  const days = getDaysInMonth(monthStart)
  const count = Math.ceil((leading + days) / 7) * 7
  return Array.from({ length: count }, (_, index) => format(addDays(monthStart, index - leading), 'yyyy-MM-dd'))
}

export function yearDates(year: number): string[] {
  const start = new Date(year, 0, 1, 12)
  const count = (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / 86_400_000
  return Array.from({ length: count }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'))
}

export function movePeriod(localDate: string, view: 'day' | 'week' | 'month' | 'year', direction: number): string {
  const date = parseISO(`${localDate}T12:00:00`)
  if (view === 'day') return format(addDays(date, direction), 'yyyy-MM-dd')
  if (view === 'week') return format(addDays(date, direction * 7), 'yyyy-MM-dd')
  if (view === 'month') return format(addMonths(date, direction), 'yyyy-MM-dd')
  return format(addYears(date, direction), 'yyyy-MM-dd')
}

export function isFuture(localDate: string, today: string): boolean {
  return localDate > today
}
