import { beforeEach, describe, expect, it } from 'vitest'
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
})
