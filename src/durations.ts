export type DurationUnit = 'seconds' | 'minutes' | 'hours'
export interface ParsedQuickAdd { name: string; seconds: number; weekdays?: number[] }

const unitSeconds: Record<DurationUnit, number> = { seconds: 1, minutes: 60, hours: 3600 }

export function parseDurationSeconds(input: string, defaultUnit: DurationUnit = 'minutes'): number | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!value) return null
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Number(value) * unitSeconds[defaultUnit])
  const clock = value.match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (clock) {
    const amount = clock[3] === undefined
      ? Number(clock[1]) * 60 + Number(clock[2])
      : Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
    if (Number(clock[2]) > 59 || (clock[3] !== undefined && Number(clock[3]) > 59)) return null
    return amount
  }
  const shorthand = value.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/)
  if (!shorthand || !shorthand[0]) return null
  return Number(shorthand[1] ?? 0) * 3600 + Number(shorthand[2] ?? 0) * 60 + Number(shorthand[3] ?? 0)
}

export function parseQuickAddTask(input: string, defaultUnit: DurationUnit = 'minutes'): ParsedQuickAdd | null {
  let text = input.trim()
  if (!text) return null
  let weekdays: number[] | undefined
  if (/\bevery\s+weekdays?\b/i.test(text)) {
    weekdays = [1, 2, 3, 4, 5]
    text = text.replace(/\bevery\s+weekdays?\b/i, '').trim()
  }
  const match = text.match(/(?:^|\s)((?:\d+(?:\.\d+)?h(?:\d+(?:\.\d+)?m)?|\d+(?:\.\d+)?m|\d+(?:\.\d+)?s|\d{1,2}:\d{2}(?::\d{2})?|\d{1,4}))$/i)
  let seconds = 1800
  if (match) {
    const parsed = parseDurationSeconds(match[1]!, defaultUnit)
    if (parsed === null || parsed <= 0 || parsed > 86400) return null
    seconds = parsed
    text = text.slice(0, match.index).trim()
  }
  if (!text) return null
  return { name: text, seconds, ...(weekdays ? { weekdays } : {}) }
}

export function formatDurationAdaptive(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds === 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ''}`
  return `${minutes}m${remainder ? ` ${remainder}s` : ''}`
}

export function formatTimerSeconds(totalSeconds: number, format: 'mm:ss' | 'hh:mm:ss' | 'adaptive' = 'adaptive'): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (format === 'hh:mm:ss' || (format === 'adaptive' && hours > 0)) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}
