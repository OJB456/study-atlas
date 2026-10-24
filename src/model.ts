export type ThemePreference = 'system' | 'light' | 'dark'

export interface Activity {
  id: string
  name: string
  description: string
  category: string
  emoji: string
  color: string
  defaultDuration: number
  dailyTargetMinutes: number | null
  weekdays: number[]
  oneOffDate: string | null
  order: number
  enabled: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskRecord {
  id: string
  activityId: string
  localDate: string
  completed: boolean
  skipped: boolean
  updatedAt: string
}

export interface FocusSession {
  id: string
  activityId: string
  localDate: string
  startedAt: string
  endedAt: string
  plannedMs: number
  actualMs: number
  discarded: boolean
}

export type TimerPhase = 'idle' | 'running' | 'paused'

export interface TimerState {
  phase: TimerPhase
  runId: string | null
  activityId: string | null
  startedAt: string | null
  segmentStartedAt: number | null
  elapsedMs: number
  targetMs: number
  localDate: string | null
}

export interface ActivateTimerResult {
  timer: TimerState
  pausedActivityId: string | null
  alreadyRunning: boolean
}

export interface AppSettings {
  timezone: string
  theme: ThemePreference
  muted: boolean
  dailyGoalMinutes: number
  weekStartsOn: 0 | 1
  lastBackupAt: string | null
}

export interface Repository {
  initialize(): Promise<void>
  listActivities(): Promise<Activity[]>
  putActivity(activity: Activity): Promise<void>
  deleteActivity(id: string): Promise<void>
  listTasks(): Promise<TaskRecord[]>
  putTask(task: TaskRecord): Promise<void>
  listSessions(): Promise<FocusSession[]>
  putSession(session: FocusSession): Promise<void>
  finalizeTimer(timer: TimerState, session: FocusSession | null): Promise<boolean>
  getTimer(): Promise<TimerState>
  putTimer(timer: TimerState): Promise<void>
  activateTimer(activityId: string, localDate: string, durationMinutes: number, now: number, runId: string): Promise<ActivateTimerResult>
  listPausedTimers(): Promise<TimerState[]>
  replacePausedTimers(timers: TimerState[]): Promise<void>
  getSettings(): Promise<AppSettings>
  putSettings(settings: AppSettings): Promise<void>
  clearData(): Promise<void>
}

export const EMPTY_TIMER: TimerState = {
  phase: 'idle',
  runId: null,
  activityId: null,
  startedAt: null,
  segmentStartedAt: null,
  elapsedMs: 0,
  targetMs: 0,
  localDate: null,
}

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: 'Asia/Kolkata',
  theme: 'system',
  muted: false,
  dailyGoalMinutes: 120,
  weekStartsOn: 1,
  lastBackupAt: null,
}

export const ACTIVITY_COLORS = ['#FF4F2E', '#2B3BFF', '#FFD84D', '#C9B6FF', '#55B58E']

export function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function taskId(activityId: string, localDate: string): string {
  return `${activityId}:${localDate}`
}

export function newActivity(name: string, options: Partial<Activity> = {}): Activity {
  const now = new Date().toISOString()
  return {
    id: makeId(),
    name,
    description: '',
    category: 'Study',
    emoji: '✳️',
    color: ACTIVITY_COLORS[0],
    defaultDuration: 30,
    dailyTargetMinutes: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    oneOffDate: null,
    order: 0,
    enabled: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...options,
  }
}
