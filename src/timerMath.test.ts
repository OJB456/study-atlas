import { describe, expect, it } from 'vitest'
import { EMPTY_TIMER } from './model'
import { elapsedMilliseconds, extendTimerState, pauseTimerState, remainingMilliseconds, resetTimerState, setTimerTarget, startTimerState } from './timerMath'

describe('timer math', () => {
  it('starts with a deadline-derived countdown, pauses, and resumes without counting the pause', () => {
    const started = startTimerState(EMPTY_TIMER, 'read', '2026-10-24', 25, 1_000, 'run-a')
    expect(remainingMilliseconds(started, 31_000)).toBe(24 * 60_000 + 30_000)

    const paused = pauseTimerState(started, 31_000)
    expect(paused.elapsedMs).toBe(30_000)
    expect(remainingMilliseconds(paused, 900_000)).toBe(24 * 60_000 + 30_000)

    const resumed = startTimerState(paused, 'read', '2026-10-24', 25, 900_000, 'ignored-run-id')
    expect(resumed.runId).toBe('run-a')
    expect(remainingMilliseconds(resumed, 930_000)).toBe(24 * 60_000)
  })

  it('recovers elapsed time after reload or background throttling from the stored start instant', () => {
    const started = startTimerState(EMPTY_TIMER, 'solve', '2026-10-24', 30, 10_000, 'run-b')
    expect(remainingMilliseconds(started, 610_000)).toBe(20 * 60_000)
    expect(remainingMilliseconds(started, 1_900_000)).toBe(0)
  })

  it('resets, extends, and edits a target without decrement counters', () => {
    const started = startTimerState(EMPTY_TIMER, 'dsa', '2026-10-24', 15, 0, 'run-c')
    const extended = extendTimerState(started, 5)
    expect(remainingMilliseconds(extended, 10_000)).toBe(19 * 60_000 + 50_000)
    const changed = setTimerTarget(extended, 10)
    expect(remainingMilliseconds(changed, 10_000)).toBe(9 * 60_000 + 50_000)
    const reset = resetTimerState(changed, 20_000)
    expect(reset.elapsedMs).toBe(0)
    expect(elapsedMilliseconds(reset, 50_000)).toBe(0)
  })
})
