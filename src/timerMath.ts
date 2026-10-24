import type { TimerState } from './model'

export function elapsedMilliseconds(timer: TimerState, now: number): number {
  return timer.elapsedMs + (timer.phase === 'running' && timer.segmentStartedAt !== null ? Math.max(0, now - timer.segmentStartedAt) : 0)
}

export function remainingMilliseconds(timer: TimerState, now: number): number {
  return Math.max(0, timer.targetMs - elapsedMilliseconds(timer, now))
}

export function startTimerState(timer: TimerState, activityId: string, localDate: string, durationMinutes: number, now: number, runId: string): TimerState {
  return timer.phase !== 'idle' && timer.activityId === activityId
    ? { ...timer, phase: 'running', segmentStartedAt: now }
    : { phase: 'running', runId, activityId, startedAt: new Date(now).toISOString(), segmentStartedAt: now, elapsedMs: 0, targetMs: durationMinutes * 60_000, localDate }
}

export function pauseTimerState(timer: TimerState, now: number): TimerState {
  if (timer.phase !== 'running') return timer
  return { ...timer, phase: 'paused', elapsedMs: elapsedMilliseconds(timer, now), segmentStartedAt: null }
}

export function resetTimerState(timer: TimerState, now: number): TimerState {
  if (timer.phase === 'idle') return timer
  return { ...timer, phase: 'paused', elapsedMs: 0, segmentStartedAt: null, startedAt: new Date(now).toISOString() }
}

export function extendTimerState(timer: TimerState, minutes: number): TimerState {
  if (timer.phase === 'idle') return timer
  return { ...timer, targetMs: timer.targetMs + minutes * 60_000 }
}

export function setTimerTarget(timer: TimerState, minutes: number): TimerState {
  if (timer.phase === 'idle' || minutes <= 0) return timer
  return { ...timer, targetMs: minutes * 60_000 }
}
