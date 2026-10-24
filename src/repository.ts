import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, EMPTY_TIMER, newActivity, type Activity, type ActivateTimerResult, type AppSettings, type FocusSession, type Repository, type TaskRecord, type TimerState } from './model'
import { pauseTimerState, startTimerState } from './timerMath'

interface AtlasDB extends DBSchema {
  activities: { key: string; value: Activity }
  tasks: { key: string; value: TaskRecord }
  sessions: { key: string; value: FocusSession }
  timers: { key: string; value: TimerState }
  meta: { key: string; value: unknown }
  outbox: { key: string; value: { id: string; table: string; payload: Record<string, unknown> } }
}

export class IndexedDBRepository implements Repository {
  protected dbPromise: Promise<IDBPDatabase<AtlasDB>>

  constructor(databaseName = 'study-atlas') {
    this.dbPromise = openDB<AtlasDB>(databaseName, 1, {
      upgrade(db) {
        db.createObjectStore('activities', { keyPath: 'id' })
        db.createObjectStore('tasks', { keyPath: 'id' })
        db.createObjectStore('sessions', { keyPath: 'id' })
        db.createObjectStore('timers', { keyPath: 'activityId' })
        db.createObjectStore('meta')
        db.createObjectStore('outbox', { keyPath: 'id' })
      },
    })
  }

  async initialize(): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction(['activities', 'meta'], 'readwrite')
    const meta = tx.objectStore('meta')
    const seeded = await meta.get('seeded')
    if (!seeded) {
      const activityStore = tx.objectStore('activities')
      await Promise.all([
        activityStore.put(newActivity('Read a research paper', { emoji: '📖', category: 'Reading', defaultDuration: 30, color: '#FF4F2E', order: 0 })),
        activityStore.put(newActivity('Solve aptitude', { emoji: '🧩', category: 'Practice', defaultDuration: 30, color: '#2B3BFF', order: 1 })),
        activityStore.put(newActivity('Solve DSA', { emoji: '⌘', category: 'Coding', defaultDuration: 60, color: '#FFD84D', order: 2 })),
        meta.put(true, 'seeded'),
      ])
    }
    await tx.done
  }

  async listActivities(): Promise<Activity[]> {
    return (await (await this.dbPromise).getAll('activities')).sort((a, b) => a.order - b.order)
  }

  async putActivity(activity: Activity): Promise<void> {
    await (await this.dbPromise).put('activities', activity)
  }

  async deleteActivity(id: string): Promise<void> {
    await (await this.dbPromise).delete('activities', id)
  }

  async listTasks(): Promise<TaskRecord[]> {
    return (await this.dbPromise).getAll('tasks')
  }

  async putTask(task: TaskRecord): Promise<void> {
    await (await this.dbPromise).put('tasks', task)
  }

  async listSessions(): Promise<FocusSession[]> {
    return (await this.dbPromise).getAll('sessions')
  }

  async putSession(session: FocusSession): Promise<void> {
    await (await this.dbPromise).put('sessions', session)
  }

  async finalizeTimer(timer: TimerState, session: FocusSession | null): Promise<boolean> {
    const db = await this.dbPromise
    const tx = db.transaction(['meta', 'sessions'], 'readwrite')
    const meta = tx.objectStore('meta')
    const current = await meta.get('timer') as TimerState | undefined
    if (!current || current.phase === 'idle' || current.runId !== timer.runId) {
      await tx.done
      return false
    }
    await meta.put(timer, 'timer')
    if (session) await tx.objectStore('sessions').put(session)
    await tx.done
    return true
  }

  async getTimer(): Promise<TimerState> {
    const timer = await (await this.dbPromise).get('meta', 'timer') as TimerState | undefined
    return timer ?? EMPTY_TIMER
  }

  async putTimer(timer: TimerState): Promise<void> {
    await (await this.dbPromise).put('meta', timer, 'timer')
  }

  async activateTimer(activityId: string, localDate: string, durationMinutes: number, now: number, runId: string): Promise<ActivateTimerResult> {
    const db = await this.dbPromise
    const tx = db.transaction(['meta', 'timers'], 'readwrite')
    const meta = tx.objectStore('meta')
    const timers = tx.objectStore('timers')
    const current = await meta.get('timer') as TimerState | undefined ?? EMPTY_TIMER
    if (current.phase === 'running' && current.activityId === activityId) {
      await tx.done
      return { timer: current, pausedActivityId: null, alreadyRunning: true }
    }
    let pausedActivityId: string | null = null
    if (current.phase !== 'idle' && current.activityId) {
      const paused = pauseTimerState(current, now)
      await timers.put(paused)
      pausedActivityId = current.activityId
    }
    const saved = await timers.get(activityId)
    if (saved) await timers.delete(activityId)
    const timer = startTimerState(saved ?? EMPTY_TIMER, activityId, localDate, durationMinutes, now, runId)
    await meta.put(timer, 'timer')
    await tx.done
    return { timer, pausedActivityId, alreadyRunning: false }
  }

  async listPausedTimers(): Promise<TimerState[]> {
    return (await this.dbPromise).getAll('timers')
  }

  async replacePausedTimers(timers: TimerState[]): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction('timers', 'readwrite')
    const store = tx.objectStore('timers')
    await store.clear()
    await Promise.all(timers.filter((timer) => timer.activityId).map((timer) => store.put(timer)))
    await tx.done
  }

  async getSettings(): Promise<AppSettings> {
    const settings = await (await this.dbPromise).get('meta', 'settings') as AppSettings | undefined
    return settings ?? DEFAULT_SETTINGS
  }

  async putSettings(settings: AppSettings): Promise<void> {
    await (await this.dbPromise).put('meta', settings, 'settings')
  }

  async clearData(): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction(['activities', 'tasks', 'sessions', 'timers', 'meta', 'outbox'], 'readwrite')
    await Promise.all([
      tx.objectStore('activities').clear(), tx.objectStore('tasks').clear(), tx.objectStore('sessions').clear(),
      tx.objectStore('timers').clear(), tx.objectStore('meta').clear(), tx.objectStore('outbox').clear(),
    ])
    await tx.objectStore('meta').put(true, 'seeded')
    await tx.done
  }

  async saveOutbox(table: string, payload: Record<string, unknown>): Promise<void> {
    const db = await this.dbPromise
    await db.put('outbox', { id: `${table}:${String(payload.id)}`, table, payload })
  }

  async getOutbox(): Promise<Array<{ id: string; table: string; payload: Record<string, unknown> }>> {
    return (await this.dbPromise).getAll('outbox')
  }

  async removeOutbox(id: string): Promise<void> {
    await (await this.dbPromise).delete('outbox', id)
  }
}

let cachedCloudClient: { url: string; key: string; client: SupabaseClient } | null = null

async function getCloudClient(): Promise<SupabaseClient | null> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!cachedCloudClient || cachedCloudClient.url !== url || cachedCloudClient.key !== key) {
    const { createClient } = await import('@supabase/supabase-js')
    cachedCloudClient = { url, key, client: createClient(url, key) }
  }
  return cachedCloudClient.client
}

export function isCloudConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export async function requestCloudSignInLink(email: string): Promise<void> {
  const client = await getCloudClient()
  if (!client) throw new Error('Add both Supabase values to .env.local before enabling cloud sync.')
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  if (error) throw error
}

class SupabaseRepository implements Repository {
  private local: IndexedDBRepository
  private client: SupabaseClient
  private userId: string

  constructor(local: IndexedDBRepository, client: SupabaseClient, userId: string) {
    this.local = local
    this.client = client
    this.userId = userId
  }

  async initialize(): Promise<void> {
    await this.local.initialize()
    await this.flushOutbox()
    const mappings: Array<{ table: string; apply: (data: Record<string, unknown>) => Promise<void>; localStamp: (id: string) => Promise<string | undefined> }> = [
      { table: 'activities', apply: async (data) => this.local.putActivity(data as unknown as Activity), localStamp: async (id) => (await this.local.listActivities()).find((item) => item.id === id)?.updatedAt },
      { table: 'daily_tasks', apply: async (data) => this.local.putTask(data as unknown as TaskRecord), localStamp: async (id) => (await this.local.listTasks()).find((item) => item.id === id)?.updatedAt },
      { table: 'focus_sessions', apply: async (data) => this.local.putSession(data as unknown as FocusSession), localStamp: async (id) => (await this.local.listSessions()).find((item) => item.id === id)?.endedAt },
    ]
    for (const mapping of mappings) {
      const { data, error } = await this.client.from(mapping.table).select('id,data,updated_at').eq('owner_id', this.userId)
      if (error || !data) continue
      for (const row of data) {
        const id = String(row.id)
        const remoteStamp = String(row.updated_at ?? '')
        const localStamp = await mapping.localStamp(id)
        if (row.data && (!localStamp || remoteStamp > localStamp)) await mapping.apply(row.data as Record<string, unknown>)
      }
    }
    const [{ data: timerData }, { data: settingsData }] = await Promise.all([
      this.client.from('timer_state').select('data').eq('owner_id', this.userId).eq('id', 'singleton').maybeSingle(),
      this.client.from('user_settings').select('data').eq('owner_id', this.userId).eq('id', 'singleton').maybeSingle(),
    ])
    if (timerData?.data) {
      const storedTimers = timerData.data as { active?: TimerState; pausedTimers?: TimerState[] }
      if (storedTimers.active) {
        await this.local.putTimer(storedTimers.active)
        await this.local.replacePausedTimers(storedTimers.pausedTimers ?? [])
      } else await this.local.putTimer(timerData.data as TimerState)
    }
    if (settingsData?.data) await this.local.putSettings(settingsData.data as AppSettings)
  }
  listActivities(): Promise<Activity[]> { return this.local.listActivities() }
  listTasks(): Promise<TaskRecord[]> { return this.local.listTasks() }
  listSessions(): Promise<FocusSession[]> { return this.local.listSessions() }
  getTimer(): Promise<TimerState> { return this.local.getTimer() }
  getSettings(): Promise<AppSettings> { return this.local.getSettings() }

  async putActivity(value: Activity): Promise<void> { await this.local.putActivity(value); await this.sync('activities', { ...value }) }
  async deleteActivity(id: string): Promise<void> {
    await this.local.deleteActivity(id)
    const { error } = await this.client.from('activities').delete().eq('id', id).eq('owner_id', this.userId)
    if (error) await this.local.saveOutbox('activities', { id, deleted: true, owner_id: this.userId, updated_at: new Date().toISOString() })
  }
  async putTask(value: TaskRecord): Promise<void> { await this.local.putTask(value); await this.sync('daily_tasks', { ...value }) }
  async putSession(value: FocusSession): Promise<void> { await this.local.putSession(value); await this.sync('focus_sessions', { ...value }) }
  async finalizeTimer(value: TimerState, session: FocusSession | null): Promise<boolean> {
    const finalized = await this.local.finalizeTimer(value, session)
    if (!finalized) return false
    if (session) await this.sync('focus_sessions', { ...session })
    await this.syncTimers()
    return true
  }
  async putTimer(value: TimerState): Promise<void> { await this.local.putTimer(value); await this.syncTimers() }
  async activateTimer(activityId: string, localDate: string, durationMinutes: number, now: number, runId: string): Promise<ActivateTimerResult> {
    const result = await this.local.activateTimer(activityId, localDate, durationMinutes, now, runId)
    await this.syncTimers()
    return result
  }
  async listPausedTimers(): Promise<TimerState[]> { return this.local.listPausedTimers() }
  async replacePausedTimers(timers: TimerState[]): Promise<void> { await this.local.replacePausedTimers(timers); await this.syncTimers() }
  async putSettings(value: AppSettings): Promise<void> { await this.local.putSettings(value); await this.sync('user_settings', { ...value }) }
  async clearData(): Promise<void> {
    await this.local.clearData()
    await Promise.all(['activities', 'daily_tasks', 'focus_sessions', 'timer_state', 'user_settings'].map((table) => this.client.from(table).delete().eq('owner_id', this.userId)))
  }

  private async syncTimers(): Promise<void> {
    const [active, pausedTimers] = await Promise.all([this.local.getTimer(), this.local.listPausedTimers()])
    await this.sync('timer_state', { active, pausedTimers })
  }

  private async sync(table: string, value: Record<string, unknown>): Promise<void> {
    const payload = { id: String(value.id ?? 'singleton'), owner_id: this.userId, data: value, updated_at: new Date().toISOString() }
    const { error } = await this.client.from(table).upsert(payload, { onConflict: 'owner_id,id' })
    if (error) await this.local.saveOutbox(table, payload)
  }

  private async flushOutbox(): Promise<void> {
    for (const item of await this.local.getOutbox()) {
      if (item.payload.deleted) {
        const { error } = await this.client.from(item.table).delete().eq('id', item.payload.id).eq('owner_id', this.userId)
        if (!error) await this.local.removeOutbox(item.id)
        continue
      }
      const { error } = await this.client.from(item.table).upsert(item.payload, { onConflict: 'owner_id,id' })
      if (!error) await this.local.removeOutbox(item.id)
    }
  }
}

export async function createRepository(): Promise<Repository> {
  const local = new IndexedDBRepository()
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return local
  try {
    const client = await getCloudClient()
    if (!client) return local
    const { data, error } = await client.auth.getUser()
    if (!error && data.user) return new SupabaseRepository(local, client, data.user.id)
  } catch {
    // Local-first operation remains available when cloud configuration is unreachable.
  }
  return local
}
