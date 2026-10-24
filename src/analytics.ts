import { format, parseISO } from 'date-fns'
import type { Activity, FocusSession, TaskRecord } from './model'
import { shiftDate, weekdayFor } from './dates'
import { taskId } from './model'

export interface DaySummary {
  date: string
  scheduled: Activity[]
  doneCount: number
  totalCount: number
  plannedMs: number
  actualMs: number
  sessions: FocusSession[]
  minutesByActivity: Record<string, number>
  completion: number
}

export function summarizeDay(
  date: string,
  activities: Activity[],
  tasks: TaskRecord[],
  sessions: FocusSession[],
): DaySummary {
  const weekday = weekdayFor(date)
  const scheduled = activities.filter((activity) =>
    !activity.archived && (activity.oneOffDate === date || (activity.oneOffDate === null && activity.enabled && activity.weekdays.includes(weekday))),
  )
  const dayTasks = new Map(tasks.filter((task) => task.localDate === date).map((task) => [task.activityId, task]))
  const daySessions = sessions.filter((session) => session.localDate === date && !session.discarded)
  const minutesByActivity: Record<string, number> = {}
  for (const session of daySessions) {
    minutesByActivity[session.activityId] = (minutesByActivity[session.activityId] ?? 0) + session.actualMs
  }
  const doneCount = scheduled.filter((activity) => {
    const task = dayTasks.get(activity.id)
    const targetMs = activity.dailyTargetMinutes ? activity.dailyTargetMinutes * 60_000 : activity.defaultDuration * 60_000
    return task?.completed || (minutesByActivity[activity.id] ?? 0) >= targetMs
  }).length
  const actualMs = daySessions.reduce((total, session) => total + session.actualMs, 0)
  const plannedMs = scheduled.reduce((total, activity) => total + activity.defaultDuration * 60_000, 0)
  return {
    date,
    scheduled,
    doneCount,
    totalCount: scheduled.length,
    plannedMs,
    actualMs,
    sessions: daySessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    minutesByActivity,
    completion: scheduled.length ? Math.round((doneCount / scheduled.length) * 100) : 0,
  }
}

export function scheduledStreaks(activity: Activity, tasks: TaskRecord[], today: string): { current: number; longest: number } {
  const taskMap = new Map(tasks.filter((task) => task.activityId === activity.id).map((task) => [task.localDate, task]))
  const scheduledDates: string[] = []
  const start = activity.createdAt.slice(0, 10)
  for (let date = start; date <= today; date = shiftDate(date, 1)) {
    if (activity.oneOffDate === date || (activity.oneOffDate === null && activity.weekdays.includes(weekdayFor(date)))) scheduledDates.push(date)
  }
  let longest = 0
  let streak = 0
  for (const date of scheduledDates) {
    const done = taskMap.get(date)?.completed === true
    streak = done ? streak + 1 : 0
    longest = Math.max(longest, streak)
  }
  let current = 0
  for (let index = scheduledDates.length - 1; index >= 0; index -= 1) {
    const date = scheduledDates[index]
    if (date && (taskMap.get(date)?.completed || date === today)) {
      if (taskMap.get(date)?.completed) current += 1
      continue
    }
    break
  }
  return { current, longest }
}

export function rangeSummaries(
  dates: string[],
  activities: Activity[],
  tasks: TaskRecord[],
  sessions: FocusSession[],
): DaySummary[] {
  return dates.map((date) => summarizeDay(date, activities, tasks, sessions))
}

export function monthlyLabel(date: string): string {
  return format(parseISO(`${date}T12:00:00`), 'MMMM yyyy')
}

export function getTaskCompletion(date: string, activity: Activity, tasks: TaskRecord[], actualMs: number): boolean {
  const task = tasks.find((item) => item.id === taskId(activity.id, date))
  return task?.completed === true || actualMs >= activity.defaultDuration * 60_000
}

export function csvEscape(value: string | number): string {
  const text = String(value)
  return `"${text.replaceAll('"', '""')}"`
}
