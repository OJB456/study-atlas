import { describe, expect, it } from 'vitest'
import { scheduledStreaks, summarizeDay } from './analytics'
import { newActivity, type FocusSession, type TaskRecord } from './model'

const activity = newActivity('Read', { id: 'read', weekdays: [1], defaultDuration: 30, dailyTargetMinutes: 30, createdAt: '2026-10-01T00:00:00.000Z' })

describe('history analytics', () => {
  it('aggregates actual focus by its stored local date and ignores discarded sessions', () => {
    const sessions: FocusSession[] = [
      { id: 'done', activityId: activity.id, localDate: '2026-10-26', startedAt: '2026-10-26T18:30:00.000Z', endedAt: '2026-10-26T19:00:00.000Z', plannedMs: 1_800_000, actualMs: 1_800_000, discarded: false },
      { id: 'discarded', activityId: activity.id, localDate: '2026-10-26', startedAt: '2026-10-26T19:00:00.000Z', endedAt: '2026-10-26T19:30:00.000Z', plannedMs: 1_800_000, actualMs: 1_800_000, discarded: true },
      { id: 'cross-midnight', activityId: activity.id, localDate: '2026-10-26', startedAt: '2026-10-26T23:50:00.000Z', endedAt: '2026-10-27T00:10:00.000Z', plannedMs: 1_200_000, actualMs: 1_200_000, discarded: false },
    ]
    const summary = summarizeDay('2026-10-26', [activity], [], sessions)
    expect(summary.actualMs).toBe(3_000_000)
    expect(summary.doneCount).toBe(1)
    expect(summary.completion).toBe(100)
    expect(summarizeDay('2026-10-27', [activity], [], sessions).actualMs).toBe(0)
  })

  it('keeps empty scheduled days visible and respects manually completed tasks', () => {
    const unscheduled = { ...activity, weekdays: [] }
    expect(summarizeDay('2026-10-26', [unscheduled], [], []).totalCount).toBe(0)
    const completed: TaskRecord = { id: 'read:2026-10-26', activityId: 'read', localDate: '2026-10-26', completed: true, skipped: false, updatedAt: '2026-10-26T10:00:00.000Z' }
    expect(summarizeDay('2026-10-26', [activity], [completed], []).completion).toBe(100)
    expect(summarizeDay('2026-10-27', [activity], [], []).totalCount).toBe(0)
  })

  it('counts streaks only over scheduled weekdays and ignores future dates', () => {
    const twiceWeekly = { ...activity, weekdays: [1, 3] }
    const tasks: TaskRecord[] = [
      { id: 'read:2026-10-19', activityId: 'read', localDate: '2026-10-19', completed: true, skipped: false, updatedAt: '2026-10-19T10:00:00.000Z' },
      { id: 'read:2026-10-21', activityId: 'read', localDate: '2026-10-21', completed: true, skipped: false, updatedAt: '2026-10-21T10:00:00.000Z' },
      { id: 'read:2026-10-26', activityId: 'read', localDate: '2026-10-26', completed: true, skipped: false, updatedAt: '2026-10-26T10:00:00.000Z' },
    ]
    expect(scheduledStreaks(twiceWeekly, tasks, '2026-10-22')).toEqual({ current: 2, longest: 2 })
  })
})
