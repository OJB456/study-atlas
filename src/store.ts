import { create } from 'zustand'
import { DEFAULT_SETTINGS, EMPTY_TIMER, makeId, taskId, type Activity, type AppSettings, type FocusSession, type Repository, type TaskRecord, type TimerState } from './model'
import { createRepository } from './repository'
import { localDateAt } from './dates'
import { elapsedMilliseconds, extendTimerState, pauseTimerState, resetTimerState, setTimerTarget } from './timerMath'

export interface AtlasStore {
  repository: Repository | null
  ready: boolean
  activities: Activity[]
  tasks: TaskRecord[]
  sessions: FocusSession[]
  timer: TimerState
  pausedTimers: TimerState[]
  settings: AppSettings
  now: number
  hydrate(): Promise<void>
  setNow(value: number): void
  saveActivity(activity: Activity): Promise<void>
  deleteActivity(id: string): Promise<void>
  toggleTask(activityId: string, localDate: string): Promise<void>
  skipTask(activityId: string, localDate: string): Promise<void>
  startTimer(activity: Activity, durationMinutes: number): Promise<string | null>
  pauseTimer(): Promise<void>
  resetTimer(): Promise<void>
  addFiveMinutes(): Promise<void>
  setTimerDuration(minutes: number): Promise<void>
  finishTimer(savePartial: boolean, markDone: boolean): Promise<void>
  addManualSession(activityId: string, localDate: string, minutes: number): Promise<void>
  updateSettings(settings: AppSettings): Promise<void>
  importBackup(value: unknown): Promise<void>
  touchBackup(): Promise<void>
  resetData(): Promise<void>
}

function scheduledTask(tasks: TaskRecord[], activityId: string, localDate: string): TaskRecord | undefined {
  return tasks.find((task) => task.id === taskId(activityId, localDate))
}

const timerChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('study-atlas-timer') : null
timerChannel?.addEventListener('message', () => {
  const repository = useAtlas.getState().repository
  if (repository) void Promise.all([repository.getTimer(), repository.listPausedTimers()]).then(([timer, pausedTimers]) => useAtlas.setState({ timer, pausedTimers }))
})

function publishTimer(timer: TimerState): void {
  timerChannel?.postMessage(timer)
}

export const useAtlas = create<AtlasStore>((set, get) => ({
  repository: null,
  ready: false,
  activities: [],
  tasks: [],
  sessions: [],
  timer: EMPTY_TIMER,
  pausedTimers: [],
  settings: DEFAULT_SETTINGS,
  now: Date.now(),

  async hydrate() {
    const repository = await createRepository()
    await repository.initialize()
    const [activities, tasks, sessions, timer, pausedTimers, settings] = await Promise.all([
      repository.listActivities(), repository.listTasks(), repository.listSessions(), repository.getTimer(), repository.listPausedTimers(), repository.getSettings(),
    ])
    set({ repository, activities: activities.sort((a, b) => a.order - b.order), tasks, sessions, timer, pausedTimers, settings, ready: true, now: Date.now() })
  },

  setNow(value) { set({ now: value }) },

  async saveActivity(activity) {
    const repository = get().repository
    if (!repository) return
    const updated = { ...activity, updatedAt: new Date().toISOString() }
    await repository.putActivity(updated)
    set((state) => ({ activities: [...state.activities.filter((item) => item.id !== updated.id), updated].sort((a, b) => a.order - b.order) }))
  },

  async deleteActivity(id) {
    const repository = get().repository
    if (!repository) return
    await repository.deleteActivity(id)
    set((state) => ({ activities: state.activities.filter((item) => item.id !== id) }))
  },

  async toggleTask(activityId, localDate) {
    const { repository, tasks } = get()
    if (!repository) return
    const current = scheduledTask(tasks, activityId, localDate)
    const next: TaskRecord = {
      id: taskId(activityId, localDate), activityId, localDate,
      completed: !(current?.completed ?? false), skipped: false, updatedAt: new Date().toISOString(),
    }
    await repository.putTask(next)
    set((state) => ({ tasks: [...state.tasks.filter((task) => task.id !== next.id), next] }))
  },

  async skipTask(activityId, localDate) {
    const repository = get().repository
    if (!repository) return
    const current = scheduledTask(get().tasks, activityId, localDate)
    const next: TaskRecord = { id: taskId(activityId, localDate), activityId, localDate, completed: false, skipped: !current?.skipped, updatedAt: new Date().toISOString() }
    await repository.putTask(next)
    set((state) => ({ tasks: [...state.tasks.filter((task) => task.id !== next.id), next] }))
  },

  async startTimer(activity, durationMinutes) {
    const { repository, settings, now } = get()
    if (!repository) return null
    const result = await repository.activateTimer(activity.id, localDateAt(now, settings.timezone), durationMinutes, now, makeId())
    const pausedTimers = await repository.listPausedTimers()
    set({ timer: result.timer, pausedTimers })
    publishTimer(result.timer)
    if (result.alreadyRunning) return 'This session is already running.'
    return result.pausedActivityId ? 'Previous focus paused and saved. You can resume it later.' : null
  },

  async pauseTimer() {
    const { repository, timer, now } = get()
    if (!repository || timer.phase !== 'running') return
    const next = pauseTimerState(timer, now)
    await repository.putTimer(next)
    set({ timer: next })
    publishTimer(next)
  },

  async resetTimer() {
    const { repository, timer, now } = get()
    if (!repository || timer.phase === 'idle') return
    const next = resetTimerState(timer, now)
    await repository.putTimer(next)
    set({ timer: next })
    publishTimer(next)
  },

  async addFiveMinutes() {
    const { repository, timer } = get()
    if (!repository || timer.phase === 'idle') return
    const next = extendTimerState(timer, 5)
    await repository.putTimer(next)
    set({ timer: next })
    publishTimer(next)
  },

  async setTimerDuration(minutes) {
    const { repository, timer } = get()
    if (!repository || timer.phase === 'idle' || minutes <= 0) return
    const next = setTimerTarget(timer, minutes)
    await repository.putTimer(next)
    set({ timer: next })
    publishTimer(next)
  },

  async finishTimer(savePartial, markDone) {
    const repository = get().repository
    if (!repository) return
    const finalize = async () => {
      const persisted = await repository.getTimer()
      if (persisted.phase === 'idle' || !persisted.activityId) return
      const now = Date.now()
      const actualMs = elapsedMilliseconds(persisted, now)
      const endedAt = new Date(now).toISOString()
      const session: FocusSession | null = actualMs > 0
        ? {
            id: makeId(), activityId: persisted.activityId, localDate: persisted.localDate ?? localDateAt(now, get().settings.timezone),
            startedAt: persisted.startedAt ?? endedAt, endedAt, plannedMs: persisted.targetMs, actualMs,
            discarded: !savePartial && !markDone,
          }
        : null
      const finalizedTimer = { ...EMPTY_TIMER, runId: persisted.runId }
      const finalized = await repository.finalizeTimer(finalizedTimer, session)
      if (!finalized) return
      if (markDone && persisted.localDate) {
        const completed: TaskRecord = {
          id: taskId(persisted.activityId, persisted.localDate), activityId: persisted.activityId, localDate: persisted.localDate,
          completed: true, skipped: false, updatedAt: new Date().toISOString(),
        }
        await repository.putTask(completed)
        set((state) => ({ tasks: [...state.tasks.filter((task) => task.id !== completed.id), completed] }))
      }
      set((state) => ({ timer: EMPTY_TIMER, sessions: session ? [...state.sessions.filter((item) => item.id !== session.id), session] : state.sessions }))
      publishTimer(finalizedTimer)
    }
    if (navigator.locks) await navigator.locks.request('study-atlas-timer-finalize', finalize)
    else await finalize()
  },

  async addManualSession(activityId, localDate, minutes) {
    const repository = get().repository
    if (!repository || minutes <= 0) return
    const end = Date.now()
    const actualMs = Math.round(minutes * 60_000)
    const session: FocusSession = {
      id: makeId(), activityId, localDate, startedAt: new Date(end - actualMs).toISOString(), endedAt: new Date(end).toISOString(),
      plannedMs: actualMs, actualMs, discarded: false,
    }
    await repository.putSession(session)
    set((state) => ({ sessions: [...state.sessions, session] }))
  },

  async updateSettings(settings) {
    const repository = get().repository
    if (!repository) return
    await repository.putSettings(settings)
    set({ settings })
  },

  async importBackup(value) {
    const repository = get().repository
    if (!repository || typeof value !== 'object' || value === null) throw new Error('This backup file is not valid.')
    const backup = value as { activities?: Activity[]; tasks?: TaskRecord[]; sessions?: FocusSession[]; settings?: AppSettings; timer?: TimerState; pausedTimers?: TimerState[] }
    for (const item of backup.activities ?? []) await repository.putActivity(item)
    for (const item of backup.tasks ?? []) await repository.putTask(item)
    for (const item of backup.sessions ?? []) await repository.putSession(item)
    if (backup.settings) await repository.putSettings(backup.settings)
    if (backup.timer) await repository.putTimer(backup.timer)
    if (backup.pausedTimers) await repository.replacePausedTimers(backup.pausedTimers)
    const [activities, tasks, sessions, settings, pausedTimers] = await Promise.all([repository.listActivities(), repository.listTasks(), repository.listSessions(), repository.getSettings(), repository.listPausedTimers()])
    set({ activities: activities.sort((a, b) => a.order - b.order), tasks, sessions, settings, pausedTimers, ...(backup.timer ? { timer: backup.timer } : {}) })
  },

  async touchBackup() {
    const { settings } = get()
    await get().updateSettings({ ...settings, lastBackupAt: new Date().toISOString() })
  },

  async resetData() {
    const repository = get().repository
    if (!repository) return
    await repository.clearData()
    const [activities, tasks, sessions, timer, pausedTimers, settings] = await Promise.all([repository.listActivities(), repository.listTasks(), repository.listSessions(), repository.getTimer(), repository.listPausedTimers(), repository.getSettings()])
    set({ activities, tasks, sessions, timer, pausedTimers, settings })
  },
}))
