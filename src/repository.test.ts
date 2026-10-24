import { beforeEach, describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import { newActivity } from './model'
import { EMPTY_TIMER, type FocusSession, type TaskRecord } from './model'
import { IndexedDBRepository } from './repository'

let databaseNumber = 0
let repository: IndexedDBRepository

beforeEach(() => {
  databaseNumber += 1
  repository = new IndexedDBRepository(`study-atlas-test-${databaseNumber}`)
})

describe('IndexedDB persistence contract', () => {
  it('seeds the three editable starter activities once only', async () => {
    await repository.initialize()
    await repository.initialize()
    const activities = await repository.listActivities()
    expect(activities.map((item) => item.name)).toEqual(['Read a research paper', 'Solve aptitude', 'Solve DSA'])
  })

  it('uses the activity and local date as a unique daily task key and preserves history when archived', async () => {
    await repository.initialize()
    const activity = (await repository.listActivities())[0]!
    const task: TaskRecord = { id: `${activity.id}:2026-10-24`, activityId: activity.id, localDate: '2026-10-24', completed: true, skipped: false, updatedAt: new Date().toISOString() }
    await repository.putTask(task)
    await repository.putTask({ ...task, completed: false })
    await repository.putActivity({ ...activity, archived: true, enabled: false })
    expect(await repository.listTasks()).toHaveLength(1)
    expect((await repository.listTasks())[0]?.completed).toBe(false)
    expect((await repository.listActivities()).find((item) => item.id === activity.id)?.archived).toBe(true)
  })

  it('recovers timer state and finalizes a run once, atomically with its session', async () => {
    const timer = { ...EMPTY_TIMER, phase: 'running' as const, runId: 'run-1', activityId: 'read', startedAt: '2026-10-24T10:00:00.000Z', segmentStartedAt: 1000, targetMs: 60000, localDate: '2026-10-24' }
    const session: FocusSession = { id: 'session-1', activityId: 'read', localDate: '2026-10-24', startedAt: timer.startedAt!, endedAt: '2026-10-24T10:01:00.000Z', plannedMs: 60000, actualMs: 60000, discarded: false }
    await repository.putTimer(timer)
    expect((await repository.getTimer()).runId).toBe('run-1')
    const finalizedTimer = { ...EMPTY_TIMER, runId: 'run-1' }
    expect(await repository.finalizeTimer(finalizedTimer, session)).toBe(true)
    expect(await repository.finalizeTimer(finalizedTimer, { ...session, id: 'duplicate' })).toBe(false)
    expect((await repository.getTimer()).phase).toBe('idle')
    expect(await repository.listSessions()).toHaveLength(1)
  })

  it('backs up legacy minute data, migrates durations to seconds once, and reads it without loss', async () => {
    const name = `study-atlas-legacy-${databaseNumber}`
    const old = await openDB(name, 1, { upgrade(db) {
      db.createObjectStore('activities', { keyPath: 'id' }); db.createObjectStore('tasks', { keyPath: 'id' })
      db.createObjectStore('sessions', { keyPath: 'id' }); db.createObjectStore('timers', { keyPath: 'activityId' })
      db.createObjectStore('meta'); db.createObjectStore('outbox', { keyPath: 'id' })
    } })
    const activity = newActivity('Legacy reading', { id: 'legacy', defaultDuration: 25, dailyTargetMinutes: 45 })
    await old.put('activities', activity)
    await old.put('meta', { ...((await import('./model')).DEFAULT_SETTINGS), dailyGoalMinutes: 120 }, 'settings')
    await old.put('meta', true, 'seeded')
    const session: FocusSession = { id: 'legacy-session', activityId: 'legacy', localDate: '2026-10-24', startedAt: '2026-10-24T10:00:00.000Z', endedAt: '2026-10-24T10:25:00.000Z', plannedMs: 1500000, actualMs: 1499000, discarded: false }
    await old.put('sessions', session)
    await old.close()

    const migrated = new IndexedDBRepository(name)
    await migrated.initialize()
    const storage = await openDB(name, 2)
    const storedActivity = await storage.get('activities', 'legacy') as unknown as Record<string, unknown>
    const storedSession = await storage.get('sessions', 'legacy-session') as unknown as Record<string, unknown>
    const storedSettings = await storage.get('meta', 'settings') as Record<string, unknown>
    const backup = await storage.get('backups', 'before-duration-seconds-v2')
    expect(storedActivity.defaultDurationSeconds).toBe(1500)
    expect(storedActivity.dailyTargetSeconds).toBe(2700)
    expect('defaultDuration' in storedActivity).toBe(false)
    expect(storedSession.actualSeconds).toBe(1499)
    expect('actualMs' in storedSession).toBe(false)
    expect(storedSettings.dailyGoalSeconds).toBe(7200)
    expect((backup.snapshot.activities as Array<Record<string, unknown>>)[0]?.defaultDuration).toBe(25)
    expect((await migrated.listActivities()).find((item) => item.id === 'legacy')?.defaultDuration).toBe(25)
    expect((await migrated.listSessions())[0]?.actualMs).toBe(1499000)
    await migrated.initialize()
    expect((await storage.get('backups', 'before-duration-seconds-v2'))?.createdAt).toBe(backup.createdAt)
    await storage.close()
  })
})
