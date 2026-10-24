import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type * as React from 'react'
import { flushSync } from 'react-dom'
import { formatInTimeZone } from 'date-fns-tz'
import { z } from 'zod'
import { BarChart3, CalendarDays, Keyboard, ListTodo, Plus, Settings2 } from 'lucide-react'
import { useAtlas } from './store'
import { ACTIVITY_COLORS, newActivity, type Activity, type AppSettings, type DurationUnit, type FocusSession } from './model'
import { formatLocalDate, isFuture, localDateAt, movePeriod, shiftDate, weekDates } from './dates'
import { rangeSummaries, scheduledStreaks, summarizeDay } from './analytics'
import { formatDurationAdaptive, formatTimerSeconds, parseDurationSeconds, parseQuickAddTask } from './durations'
import { isCloudConfigured, requestCloudSignInLink, serializeSecondsBackup } from './repository'
import { AtlasMascot, CheckMark, Ring } from './components'
import './App.css'

const WeekView = lazy(() => import('./views/WeekView'))
const MonthView = lazy(() => import('./views/MonthView'))
const YearView = lazy(() => import('./views/YearView'))

type View = 'day' | 'week' | 'month' | 'year'
type MobileDestination = 'today' | 'activities' | 'stats' | 'settings'
const viewLabels: Record<View, string> = { day: 'DAY', week: 'WEEK', month: 'MONTH', year: 'YEAR' }
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const activitySchema = z.object({
  name: z.string().trim().min(1, 'Give this activity a name.').max(48),
  description: z.string().max(180),
  category: z.string().trim().min(1).max(24),
  defaultDuration: z.number().min(1 / 60).max(1440),
  dailyTargetMinutes: z.number().min(1 / 60).max(1440).nullable(),
})

function clockText(now: number, timezone: string, pattern: string): string {
  return formatInTimeZone(now, timezone, pattern)
}

function LiveClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  return <div className="live-clock"><span className="clock-pip" />{clockText(now, timezone, 'EEE · HH:mm:ss')}<span className="clock-zone">{timezone.split('/').at(-1)?.replaceAll('_', ' ')}</span></div>
}

function durationLabel(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function nowDateGreeting(timestamp: number): string {
  const hour = new Date(timestamp).getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function durationInputValue(seconds: number, unit: DurationUnit): string {
  return String(unit === 'seconds' ? seconds : unit === 'hours' ? seconds / 3600 : seconds / 60)
}

function QuickAddBar({ activities, defaultInputUnit, onAdd, onSelect, onError }: { activities: Activity[]; defaultInputUnit: DurationUnit; onAdd: (activity: Activity) => Promise<void>; onSelect: (activity: Activity) => void; onError: () => void }) {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState<Activity[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  function submit(event?: FormEvent) {
    event?.preventDefault()
    const parsed = parseQuickAddTask(value, defaultInputUnit)
    if (!parsed) { onError(); return }
    const activity = newActivity(parsed.name, { defaultDuration: parsed.seconds / 60, weekdays: parsed.weekdays ?? [0, 1, 2, 3, 4, 5, 6], order: activities.length + pending.length })
    flushSync(() => {
      setPending((items) => [...items, activity])
      setValue('')
    })
    void onAdd(activity).then(() => window.setTimeout(() => setPending((items) => items.filter((item) => item.id !== activity.id)), 350)).catch(() => { setPending((items) => items.filter((item) => item.id !== activity.id)); onError() })
  }
  return <>
    <form className="quick-add" onSubmit={submit} role="group" aria-label="Quick add task"><Plus aria-hidden="true" /><input ref={inputRef} aria-label="Quick add a task" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Add a task · try “Read paper 1h”" /><button type="submit">Add task</button></form>
    {pending.map((activity) => <div className="quick-add-optimistic" key={activity.id} role="status"><span className="quick-add-optimistic-dot" style={{ background: activity.color }} /><strong>{activity.emoji} {activity.name}</strong><span>{formatDurationAdaptive(activity.defaultDuration * 60)} · saving</span></div>)}
    {activities.length > 0 && <div className="quick-add-chips" aria-label="Recent activities">{activities.filter((item) => !item.archived).slice(0, 4).map((activity) => <button key={activity.id} onClick={() => onSelect(activity)} title={activity.name}><span style={{ background: activity.color }} />{activity.name}</button>)}</div>}
  </>
}

function ActivityForm({ initial, date, defaultInputUnit, onClose, onSave }: { initial: Activity | null; date: string; defaultInputUnit: DurationUnit; onClose: () => void; onSave: (activity: Activity) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'Study')
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(defaultInputUnit)
  const [duration, setDuration] = useState(initial ? formatDurationAdaptive(initial.defaultDuration * 60) : defaultInputUnit === 'seconds' ? '1800' : defaultInputUnit === 'hours' ? '0.5' : '30')
  const [targetUnit, setTargetUnit] = useState<DurationUnit>(defaultInputUnit)
  const [target, setTarget] = useState(initial?.dailyTargetMinutes ? formatDurationAdaptive(initial.dailyTargetMinutes * 60) : '')
  const [color, setColor] = useState(initial?.color ?? ACTIVITY_COLORS[0]!)
  const [emoji, setEmoji] = useState(initial?.emoji ?? '✳️')
  const [days, setDays] = useState(initial?.weekdays ?? [0, 1, 2, 3, 4, 5, 6])
  const [oneOff, setOneOff] = useState(Boolean(initial?.oneOffDate))
  const [oneOffDate, setOneOffDate] = useState(initial?.oneOffDate ?? date)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [archived, setArchived] = useState(initial?.archived ?? false)
  const [error, setError] = useState('')
  const touchStart = useRef(0)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const defaultSeconds = parseDurationSeconds(duration, durationUnit)
    const targetSeconds = target ? parseDurationSeconds(target, targetUnit) : null
    if (defaultSeconds === null || defaultSeconds <= 0 || (target && (targetSeconds === null || targetSeconds <= 0))) { setError('Enter a duration like 25m, 90s, or 1h30m.'); return }
    const parsed = activitySchema.safeParse({ name, description, category, defaultDuration: defaultSeconds / 60, dailyTargetMinutes: targetSeconds === null ? null : targetSeconds / 60 })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the fields and try again.'); return }
    const activity = initial
      ? { ...initial, ...parsed.data, emoji, color, weekdays: oneOff ? [] : days, oneOffDate: oneOff ? oneOffDate : null, enabled, archived }
      : newActivity(parsed.data.name, { ...parsed.data, emoji, color, weekdays: oneOff ? [] : days, oneOffDate: oneOff ? oneOffDate : null })
    onSave(activity)
  }

  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card activity-modal modal-enter" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientY ?? 0 }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientY ?? touchStart.current; if (end - touchStart.current > 120) onClose() }}>
      <div className="modal-heading"><div><span className="eyebrow">FIELD NOTE</span><h2 id="activity-modal-title">{initial ? 'Edit activity' : 'Add an activity'}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>
      <form onSubmit={submit} className="form-grid">
        <label className="field field-wide"><span>Activity name</span><input autoFocus maxLength={48} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read a research paper" /></label>
        <label className="field"><span>Category</span><input maxLength={24} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Study" /></label>
        <label className="field"><span>Default session</span><div className="duration-input-unit"><input aria-label="Default session duration" inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="25m" /><select aria-label="Default session unit" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}><option value="seconds">sec</option><option value="minutes">min</option><option value="hours">hr</option></select></div></label>
        <label className="field field-wide"><span>Notes <i>optional</i></span><input maxLength={180} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A small reminder for your next session" /></label>
        <label className="field"><span>Daily target <i>optional</i></span><div className="duration-input-unit"><input aria-label="Daily target duration" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="—" /><select aria-label="Daily target unit" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value as DurationUnit)}><option value="seconds">sec</option><option value="minutes">min</option><option value="hours">hr</option></select></div></label>
        <div className="field"><span>Mark</span><div className="emoji-colors"><input aria-label="Activity emoji" value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} /><div className="color-swatches">{ACTIVITY_COLORS.map((swatch) => <button type="button" key={swatch} aria-label={`Use ${swatch} accent`} className={color === swatch ? 'selected' : ''} style={{ background: swatch }} onClick={() => setColor(swatch)} />)}</div></div></div>
        <div className="field field-wide"><span>Schedule</span><label className="toggle-row"><input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} /> A one-off task on a specific day</label>{oneOff ? <input className="date-input" aria-label="One-off task date" type="date" value={oneOffDate} onChange={(e) => setOneOffDate(e.target.value)} /> : <div className="weekday-picker">{weekdays.map((day, index) => { const weekday = (index + 1) % 7; return <button type="button" key={day} className={days.includes(weekday) ? 'active' : ''} onClick={() => setDays((previous) => previous.includes(weekday) ? previous.filter((item) => item !== weekday) : [...previous, weekday])}>{day}</button> })}</div>}</div>
        {initial && <div className="field-wide activity-manage-controls"><label className="toggle-row"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Activity is enabled on its schedule</label><label className="toggle-row"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archive activity and preserve history</label></div>}
        {error && <p className="form-error field-wide">{error}</p>}
        <div className="modal-actions field-wide"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{initial ? 'Save changes' : 'Add to atlas'} <span>↗</span></button></div>
      </form>
      <p className="shortcut-note">Keyboard shortcut <kbd>N</kbd> to add a new activity</p>
    </section>
  </div>
}

function ManualTimeForm({ activity, date, timezone, defaultInputUnit, onClose, onSave }: { activity: Activity; date: string; timezone: string; defaultInputUnit: DurationUnit; onClose: () => void; onSave: (minutes: number) => void }) {
  const [unit, setUnit] = useState<DurationUnit>(defaultInputUnit)
  const [value, setValue] = useState(defaultInputUnit === 'seconds' ? '900' : defaultInputUnit === 'hours' ? '0.25' : '15')
  const [error, setError] = useState('')
  const touchStart = useRef(0)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const seconds = parseDurationSeconds(value, unit)
    if (seconds === null || seconds <= 0 || seconds > 86400) { setError('Enter a duration like 90s, 25m, or 1h30m.'); return }
    onSave(seconds / 60)
  }
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card manual-time-modal modal-enter" role="dialog" aria-modal="true" aria-labelledby="manual-time-title" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientY ?? 0 }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientY ?? touchStart.current; if (end - touchStart.current > 120) onClose() }}>
      <div className="modal-heading"><div><span className="eyebrow">BACKFILL</span><h2 id="manual-time-title">Add focused time</h2></div><button className="icon-button" aria-label="Close manual time dialog" onClick={onClose}>×</button></div>
      <p className="manual-time-description">{activity.emoji} {activity.name} · {formatLocalDate(date, 'EEE, d MMM', timezone)}</p>
      <form className="manual-time-form" onSubmit={submit}><label className="field"><span>Time spent</span><div className="duration-input-unit"><input aria-label="Manual time duration" autoFocus inputMode="decimal" value={value} onChange={(event) => { setValue(event.target.value); setError('') }} placeholder="25m" /><select aria-label="Manual time unit" value={unit} onChange={(event) => setUnit(event.target.value as DurationUnit)}><option value="seconds">sec</option><option value="minutes">min</option><option value="hours">hr</option></select></div></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">Save time</button></div></form>
    </section>
  </div>
}

function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card shortcuts-modal modal-enter" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="modal-heading"><div><span className="eyebrow">QUICK KEYS</span><h2 id="shortcuts-title">Keyboard shortcuts</h2></div><button className="icon-button" aria-label="Close keyboard shortcuts" onClick={onClose}>×</button></div>
      <dl className="shortcuts-list">
        <div><dt>Add an activity</dt><dd><kbd>N</kbd></dd></div>
        <div><dt>Start, pause, or resume focus</dt><dd><kbd>Space</kbd></dd></div>
        <div><dt>Switch Day, Week, Month, Year</dt><dd><kbd>1</kbd>–<kbd>4</kbd></dd></div>
        <div><dt>Show this guide</dt><dd><kbd>?</kbd></dd></div>
        <div><dt>Close a sheet or exit focus mode</dt><dd><kbd>Esc</kbd></dd></div>
      </dl>
      <p className="shortcut-note">Shortcuts pause while you’re typing in a field.</p>
    </section>
  </div>
}

function SettingsPanel({ settings, onClose, onSave, onExport, onImport, onReset, onShortcuts, cloudConfigured, onCloudSignIn }: { settings: AppSettings; onClose: () => void; onSave: (settings: AppSettings) => void; onExport: () => void; onImport: (file: File) => void; onReset: () => void; onShortcuts: () => void; cloudConfigured: boolean; onCloudSignIn: (email: string) => Promise<void> }) {
  const [timezone, setTimezone] = useState(settings.timezone)
  const [inputUnit, setInputUnit] = useState<DurationUnit>(settings.defaultInputUnit)
  const [goalUnit, setGoalUnit] = useState<DurationUnit>(settings.defaultInputUnit)
  const [goal, setGoal] = useState(String(settings.dailyGoalMinutes * 60 / (settings.defaultInputUnit === 'seconds' ? 1 : settings.defaultInputUnit === 'hours' ? 3600 : 60)))
  const [timerFormat, setTimerFormat] = useState<AppSettings['timerDisplayFormat']>(settings.timerDisplayFormat)
  const [presets, setPresets] = useState(settings.timerPresetsSeconds.map(formatDurationAdaptive).join(', '))
  const [joyLevel, setJoyLevel] = useState<AppSettings['joyLevel']>(settings.joyLevel)
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(settings.weekStartsOn)
  const [theme, setTheme] = useState(settings.theme)
  const [muted, setMuted] = useState(settings.muted)
  const [timezoneError, setTimezoneError] = useState('')
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudStatus, setCloudStatus] = useState('')
  const touchStart = useRef(0)
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card settings-modal modal-enter" role="dialog" aria-modal="true" aria-labelledby="settings-title" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientY ?? 0 }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientY ?? touchStart.current; if (end - touchStart.current > 120) onClose() }}>
      <div className="modal-heading"><div><span className="eyebrow">YOUR ATLAS</span><h2 id="settings-title">Preferences</h2></div><button className="icon-button" aria-label="Close preferences" onClick={onClose}>×</button></div>
      <div className="settings-fields">
        <label className="field"><span>Calendar timezone</span><input value={timezone} onChange={(e) => { setTimezone(e.target.value); setTimezoneError('') }} placeholder="Asia/Kolkata" /><small>History dates follow this timezone. Stored timestamps stay in UTC.</small>{timezoneError && <small className="field-error">{timezoneError}</small>}</label>
        <label className="field"><span>Daily focus goal</span><div className="duration-input-unit"><input aria-label="Daily focus goal" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} /><select aria-label="Daily focus goal unit" value={goalUnit} onChange={(e) => setGoalUnit(e.target.value as DurationUnit)}><option value="seconds">sec</option><option value="minutes">min</option><option value="hours">hr</option></select></div></label>
        <label className="field"><span>Week begins</span><select value={weekStartsOn} onChange={(e) => setWeekStartsOn(Number(e.target.value) as 0 | 1)}><option value={1}>Monday</option><option value={0}>Sunday</option></select></label>
        <label className="field"><span>Appearance</span><select value={theme} onChange={(e) => setTheme(e.target.value as AppSettings['theme'])}><option value="system">Follow system</option><option value="light">Light paper</option><option value="dark">Dark ink</option></select></label>
        <label className="field"><span>Default duration unit</span><select value={inputUnit} onChange={(e) => setInputUnit(e.target.value as DurationUnit)}><option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label>
        <label className="field"><span>Timer display</span><select value={timerFormat} onChange={(e) => setTimerFormat(e.target.value as AppSettings['timerDisplayFormat'])}><option value="adaptive">Adaptive (25m)</option><option value="mm:ss">mm:ss</option><option value="hh:mm:ss">hh:mm:ss</option></select></label>
        <label className="field"><span>Timer presets <i>comma separated</i></span><input aria-label="Timer presets" value={presets} onChange={(e) => setPresets(e.target.value)} placeholder="15m, 25m, 45m, 1h" /></label>
        <label className="field"><span>Joy level</span><select value={joyLevel} onChange={(e) => setJoyLevel(e.target.value as AppSettings['joyLevel'])}><option value="full">Full · sound, haptics, celebration</option><option value="calm">Calm · subtle haptics</option><option value="off">Off · no effects</option></select></label>
        <label className="toggle-row"><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> Mute completion chime</label>
      </div>
      <button className="button button-outline shortcuts-launch" onClick={onShortcuts}><Keyboard aria-hidden="true" /> Keyboard shortcuts <kbd>?</kbd></button>
      <div className="backup-box"><div><strong>Your data, your shelf</strong><p>Keep a portable JSON copy or bring a backup back in.</p></div><div className="backup-actions"><button className="button button-outline" onClick={onExport}>Export JSON</button><label className="button button-outline file-button">Import JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImport(file) }} /></label></div></div>
      <div className="cloud-box"><div><strong>Optional cloud sync</strong><p>{cloudConfigured ? 'Sign in to sync this local atlas through your Supabase project.' : 'Add the two Supabase values from .env.example to turn this on.'}</p></div>{cloudConfigured && <div className="cloud-signin"><input aria-label="Email for cloud sync" type="email" value={cloudEmail} onChange={(e) => setCloudEmail(e.target.value)} placeholder="you@example.com" /><button className="button button-outline" disabled={!cloudEmail.includes('@')} onClick={() => { setCloudStatus('Sending…'); void onCloudSignIn(cloudEmail).then(() => setCloudStatus('Check your inbox for a sign-in link.')).catch((error: unknown) => setCloudStatus(error instanceof Error ? error.message : 'Could not send a sign-in link.')) }}>Send sign-in link</button><small>{cloudStatus}</small></div>}</div>
      <div className="modal-actions settings-bottom"><button className="text-danger" onClick={onReset}>Reset all data</button><div><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={() => { try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); const goalSeconds = parseDurationSeconds(goal, goalUnit); if (goalSeconds === null || goalSeconds <= 0) throw new Error('Enter a positive daily goal.'); const timerPresetsSeconds = presets.split(',').map((item) => parseDurationSeconds(item, inputUnit)).filter((item): item is number => item !== null && item > 0 && item <= 86400); if (!timerPresetsSeconds.length) throw new Error('Add at least one valid timer preset.'); onSave({ ...settings, timezone, dailyGoalMinutes: goalSeconds / 60, defaultInputUnit: inputUnit, timerDisplayFormat: timerFormat, timerPresetsSeconds, joyLevel, weekStartsOn, theme, muted }) } catch (error) { setTimezoneError(error instanceof Error ? error.message : 'Check the preference fields.') } }}>Save preferences</button></div></div>
    </section>
  </div>
}

function App() {
  const store = useAtlas()
  const hydrate = useAtlas((state) => state.hydrate)
  const finishTimer = useAtlas((state) => state.finishTimer)
  const pauseTimer = useAtlas((state) => state.pauseTimer)
  const startTimer = useAtlas((state) => state.startTimer)
  const { ready, activities, tasks, sessions, timer, pausedTimers, settings } = store
  const [view, setView] = useState<View>('day')
  const [now, setNow] = useState(() => Date.now())
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; activity: Activity | null }>({ open: false, activity: null })
  const [manualEntry, setManualEntry] = useState<Activity | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [celebration, setCelebration] = useState(false)
  const [deletedSession, setDeletedSession] = useState<FocusSession | null>(null)
  const [monthDay, setMonthDay] = useState('')
  const [backupDismissed, setBackupDismissed] = useState(false)
  const [durationDraft, setDurationDraft] = useState('30')
  const [timerDurationUnit, setTimerDurationUnit] = useState<DurationUnit | null>(null)
  const effectiveTimerUnit = timerDurationUnit ?? settings.defaultInputUnit
  const [durationTouched, setDurationTouched] = useState(false)
  const [filterCategory, setFilterCategory] = useState('All')
  const [mobileDestination, setMobileDestination] = useState<MobileDestination>('today')
  const [focusMode, setFocusMode] = useState(false)
  const completionSent = useRef(false)
  const swipeStartX = useRef<number | null>(null)
  const today = localDateAt(now, settings.timezone)
  const date = selectedDate || today
  const currentSummary = useMemo(() => summarizeDay(date, activities, tasks, sessions), [date, activities, tasks, sessions])
  const selectedActivity = activities.find((item) => item.id === selectedId && item.enabled && !item.archived) ?? currentSummary.scheduled[0] ?? activities.find((item) => item.enabled && !item.archived)
  const timerActivity = activities.find((item) => item.id === timer.activityId)
  const activeActivity = timerActivity ?? selectedActivity
  const parsedDurationSeconds = parseDurationSeconds(durationDraft, effectiveTimerUnit)
  const durationValue = durationTouched ? (parsedDurationSeconds && parsedDurationSeconds > 0 ? parsedDurationSeconds / 60 : activeActivity?.defaultDuration || 30) : activeActivity?.defaultDuration ?? (parsedDurationSeconds ? parsedDurationSeconds / 60 : 30)
  const elapsed = timer.elapsedMs + (timer.phase === 'running' && timer.segmentStartedAt !== null ? Math.max(0, now - timer.segmentStartedAt) : 0)
  const remaining = Math.max(0, timer.targetMs - elapsed)
  const timerProgress = timer.targetMs > 0 ? Math.min(1, elapsed / timer.targetMs) : 0

  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), timer.phase === 'running' ? 1000 : 60_000)
    return () => window.clearInterval(interval)
  }, [timer.phase])
  useEffect(() => {
    if (timer.phase === 'running') document.title = `${durationLabel(remaining)} · Study Atlas`
    else document.title = 'Study Atlas — keep your days in view'
    return () => { document.title = 'Study Atlas' }
  }, [timer.phase, remaining])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = () => root.dataset.theme = media.matches ? 'dark' : 'light'
      apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply)
    }
    root.dataset.theme = settings.theme
  }, [settings.theme])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target?.matches('input, textarea, select, [contenteditable=true]')
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); setActivityDialog({ open: true, activity: null }) }
      if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) { event.preventDefault(); setShortcutsOpen(true) }
      if (event.code === 'Space' && timer.phase !== 'idle') { event.preventDefault(); if (timer.phase === 'running') void pauseTimer(); else if (activeActivity) void startTimer(activeActivity, Math.max(1, Math.ceil(timer.targetMs / 60_000))) }
      if (['1', '2', '3', '4'].includes(event.key)) setView((['day', 'week', 'month', 'year'][Number(event.key) - 1] as View))
      if (event.key === 'Escape') { setActivityDialog({ open: false, activity: null }); setSettingsOpen(false); setShortcutsOpen(false); setFocusMode(false) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [timer.phase, timer.targetMs, activeActivity, pauseTimer, startTimer, focusMode])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const filterOptions = useMemo(() => ['All', ...new Set(activities.filter((item) => !item.archived).map((item) => item.category))], [activities])
  const visibleActivities = activities.filter((item) => (showArchived ? item.archived : !item.archived) && (!search || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(search.toLowerCase())) && (filterCategory === 'All' || item.category === filterCategory))
  const displayedActivities = visibleActivities.filter((item) => showArchived || currentSummary.scheduled.some((scheduled) => scheduled.id === item.id) || !item.enabled)
  const countdownText = timer.phase === 'idle' ? formatTimerSeconds(durationValue * 60, settings.timerDisplayFormat) : formatTimerSeconds(remaining / 1000, settings.timerDisplayFormat)
  const isFutureDay = isFuture(date, today)
  const dayCompletionRatio = currentSummary.totalCount ? currentSummary.doneCount / currentSummary.totalCount : 0
  const dailyGoalProgress = Math.min(1, currentSummary.actualMs / (settings.dailyGoalMinutes * 60_000))
  const currentStreak = Math.max(0, ...activities.map((activity) => scheduledStreaks(activity, tasks, today).current))
  const latestMilestone = [3, 7, 14, 30, 100].filter((milestone) => currentStreak >= milestone).at(-1)
  const week = weekDates(date, settings.weekStartsOn)
  const weekStats = rangeSummaries(week, activities, tasks, sessions)
  const lastBackup = settings.lastBackupAt ? localDateAt(new Date(settings.lastBackupAt), settings.timezone) : ''
  const shouldBackup = !lastBackup || (today > lastBackup && shiftDate(lastBackup, 7) <= today)

  function move(direction: number) { setSelectedDate(movePeriod(date, view, direction)); setMonthDay('') }
  function navigateMobile(destination: MobileDestination) {
    setMobileDestination(destination)
    if (destination === 'today') { setView('day'); document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' }) }
    if (destination === 'activities') { setView('day'); window.setTimeout(() => { document.getElementById('activities-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.querySelector<HTMLInputElement>('[aria-label="Quick add a task"]')?.focus({ preventScroll: true }) }, 120) }
    if (destination === 'stats') { setView('week'); document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' }) }
    if (destination === 'settings') setSettingsOpen(true)
  }
  function startFocus() {
    if (!activeActivity) { setActivityDialog({ open: true, activity: null }); return }
    if (isFutureDay) { setToast('Future dates are a blank page.'); return }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
    const duration = timer.phase === 'idle' ? Math.max(1, durationValue || activeActivity.defaultDuration) : Math.max(1, Math.ceil(timer.targetMs / 60_000))
    void store.startTimer(activeActivity, duration).then((message) => { if (message) setToast(message) })
  }
  const completeChime = useCallback(() => {
    if (!settings.muted && settings.joyLevel === 'full') {
      try {
        const context = new AudioContext()
        const oscillator = context.createOscillator(); const gain = context.createGain()
        oscillator.type = 'sine'; oscillator.frequency.value = 660; gain.gain.value = 0.045
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.16)
        oscillator.onended = () => void context.close()
      } catch { /* Audio may not be available in this browser. */ }
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('A good stretch of focus.', { body: `${timerActivity?.name ?? 'Your activity'} is complete.` })
    setToast('Session complete. A small mark made in the day.')
  }, [settings.muted, settings.joyLevel, timerActivity?.name])
  useEffect(() => {
    if (timer.phase === 'running' && timer.targetMs > 0 && remaining <= 0 && !completionSent.current) {
      completionSent.current = true
      completeChime()
      void finishTimer(true, true)
    }
    if (timer.phase !== 'running') completionSent.current = false
  }, [timer.phase, timer.targetMs, timer.segmentStartedAt, remaining, finishTimer, completeChime])
  function finishFromButton(save: boolean) {
    void store.finishTimer(save, false)
    setToast(save ? 'Elapsed focus saved.' : 'Session discarded.')
  }
  function markTask(activity: Activity, day = date) {
    if (isFuture(day, today)) return
    const existing = tasks.find((task) => task.id === `${activity.id}:${day}`)
    const completing = !existing?.completed
    if (completing && settings.joyLevel !== 'off' && 'vibrate' in navigator) navigator.vibrate(settings.joyLevel === 'full' ? [18, 30, 18] : 10)
    if (completing && day === date && currentSummary.totalCount > 0 && currentSummary.doneCount + 1 >= currentSummary.totalCount) {
      if (settings.joyLevel === 'full') {
        setCelebration(true)
        window.setTimeout(() => setCelebration(false), 1800)
      }
      setToast('Every mark made. That’s a day well spent.')
    }
    if (!existing?.completed && timer.activityId === activity.id && timer.localDate === day && timer.phase !== 'idle') {
      void store.finishTimer(true, true)
      return
    }
    void store.toggleTask(activity.id, day)
  }
  function skipOccurrence(activity: Activity, day = date) {
    if (isFuture(day, today)) return
    const wasSkipped = tasks.find((task) => task.id === `${activity.id}:${day}`)?.skipped ?? false
    const saveSkip = () => store.skipTask(activity.id, day)
    if (timer.activityId === activity.id && timer.localDate === day && timer.phase !== 'idle') void store.finishTimer(true, false).then(saveSkip)
    else void saveSkip()
    setToast(wasSkipped ? `${activity.name} is back on the schedule.` : `${activity.name} skipped for today. Tap Skip to undo.`)
  }
  function editPastSession(session: FocusSession) {
    const value = window.prompt('Update focused time (e.g. 45m, 90s, or 1h30m).', formatDurationAdaptive(session.actualMs / 1000))
    if (!value) return
    const seconds = parseDurationSeconds(value, settings.defaultInputUnit)
    if (seconds === null || seconds <= 0) { setToast('Enter a positive duration.'); return }
    void store.updateSession({ ...session, actualMs: seconds * 1000 }).then(() => setToast('Session time updated.')).catch(() => setToast('Could not update that session.'))
  }
  function deletePastSession(session: FocusSession) {
    if (!window.confirm('Delete this session from your history?')) return
    void store.deleteSession(session.id).then(() => {
      setDeletedSession(session)
      setToast('Session deleted.')
      window.setTimeout(() => setDeletedSession(null), 2800)
    }).catch(() => setToast('Could not delete that session.'))
  }
  function undoDeleteSession() {
    if (!deletedSession) return
    void store.updateSession(deletedSession).then(() => setToast('Session restored.'))
    setDeletedSession(null)
  }
  function reorder(activity: Activity, direction: number) {
    const sorted = [...activities].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex((item) => item.id === activity.id)
    const swap = sorted[index + direction]
    if (!swap) return
    const changed = [{ ...activity, order: swap.order }, { ...swap, order: activity.order }]
    void Promise.all(changed.map((item) => store.saveActivity(item)))
  }
  async function exportBackup() {
    const pausedTimers = await store.repository?.listPausedTimers() ?? []
    const data = serializeSecondsBackup({ exportedAt: new Date().toISOString(), timezone: settings.timezone, activities, tasks, sessions, timer, pausedTimers, settings })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `study-atlas-${today}.json`; anchor.click(); URL.revokeObjectURL(url)
    await store.touchBackup(); setToast('A fresh copy is tucked away.')
  }
  async function exportCSV() {
    const rows = [['activity', 'category', 'local_date', 'started_at_utc', 'ended_at_utc', 'planned_seconds', 'actual_seconds', 'discarded'], ...sessions.map((session) => {
      const activity = activities.find((item) => item.id === session.activityId)
      return [activity?.name ?? 'Deleted activity', activity?.category ?? '', session.localDate, session.startedAt, session.endedAt, String(Math.round(session.plannedMs / 1000)), String(Math.round(session.actualMs / 1000)), String(session.discarded)]
    })]
    const text = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `study-atlas-sessions-${today}.csv`; anchor.click(); URL.revokeObjectURL(url)
    setToast('Session ledger exported as CSV.')
  }
  async function importFile(file: File) {
    try { await store.importBackup(JSON.parse(await file.text())); setToast('Your backup has been added to the atlas.'); setSettingsOpen(false) }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not read this backup.') }
  }
  function resetAll() {
    if (window.confirm('Reset all Study Atlas data on this device? This cannot be undone.')) { void store.resetData(); setSettingsOpen(false); setToast('The atlas is clear again.') }
  }

  if (!ready) return <main className="loading-screen"><div className="loading-mark">A</div><p>Opening today’s pages…</p></main>

  return <div className={`app-shell ${focusMode ? 'focus-mode' : ''}`}>
    <aside className="sidebar">
      <a className="brand" href="#home" aria-label="Study Atlas home"><AtlasMascot mood={timer.phase === 'running' ? 'focused' : currentSummary.totalCount > 0 && currentSummary.doneCount === currentSummary.totalCount ? 'cheering' : 'idle'} /><span>STUDY<br />ATLAS</span><i>✳</i></a>
      <div className="sidebar-section-label">YOUR FIELD GUIDE</div>
      <nav className="view-nav" aria-label="Tracking period">{(Object.keys(viewLabels) as View[]).map((item, index) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}><span className="nav-symbol">{['◷', '▦', '▤', '▥'][index]}</span><span>{viewLabels[item]}</span><kbd>{index + 1}</kbd></button>)}</nav>
      <div className="sidebar-rule" />
      <div className="sidebar-section-label">AT A GLANCE</div>
      <div className="sidebar-stat"><span className="tiny-dot" /><span>Today’s focus</span><strong>{Math.floor(currentSummary.actualMs / 3_600_000)}h {Math.floor(currentSummary.actualMs % 3_600_000 / 60_000)}m</strong></div>
      <div className="sidebar-stat"><span className="tiny-dot coral" /><span>Week’s focus</span><strong>{(weekStats.reduce((sum, item) => sum + item.actualMs, 0) / 3_600_000).toFixed(1)}h</strong></div>
      <div className="sidebar-bottom"><div className="sidebar-note"><span>✎</span><p>Small steps leave<br />the clearest trail.</p><div className="note-stamp">KEEP<br />GOING</div></div><button className="sidebar-tool" onClick={exportCSV}><span>↗</span> Export session ledger</button><button className="sidebar-tool" onClick={() => setSettingsOpen(true)}><span>⚙</span> Preferences</button><button className="sidebar-tool" onClick={() => setShortcutsOpen(true)}><Keyboard aria-hidden="true" /> Keyboard shortcuts <kbd>?</kbd></button><p className="version-note">LOCAL-FIRST · YOUR DATA STAYS YOURS</p></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="mobile-brand"><AtlasMascot mood={timer.phase === 'running' ? 'focused' : currentSummary.totalCount > 0 && currentSummary.doneCount === currentSummary.totalCount ? 'cheering' : 'idle'} size={34} /><strong>STUDY ATLAS</strong></div><div className="breadcrumb"><span>PERSONAL ATLAS</span><b> / </b><strong>{viewLabels[view]} RECORD</strong></div><div className="topbar-right"><LiveClock timezone={settings.timezone} /><button className="top-icon" onClick={exportBackup} aria-label="Export data backup" title="Export JSON backup">⇩</button><button className="avatar-button" onClick={() => setSettingsOpen(true)} aria-label="Open preferences">AT</button></div></header>
      <div className="content-wrap">
        <div className="page-heading"><div><div className="eyebrow">{view === 'day' ? `${nowDateGreeting(now)}, friend` : 'A WIDER LOOK AT THE WORK'}</div><div className="date-title-line"><h1>{view === 'day' ? formatLocalDate(date, 'EEE, d MMM', settings.timezone) : view === 'week' ? `${formatLocalDate(week[0]!, 'd MMM', settings.timezone)} — ${formatLocalDate(week[6]!, 'd MMM', settings.timezone)}` : view === 'month' ? formatLocalDate(date, 'MMMM yyyy', settings.timezone) : date.slice(0, 4)}</h1>{date === today && <span className="today-badge">TODAY</span>}</div></div><div className="date-controls"><button className="icon-button nav-arrow" aria-label="Previous period" onClick={() => move(-1)}>←</button><button className="today-button" onClick={() => { setSelectedDate(today); setMonthDay('') }}>Today</button><button className="icon-button nav-arrow" aria-label="Next period" onClick={() => move(1)}>→</button></div></div>
        {shouldBackup && !backupDismissed && <div className="backup-reminder"><span className="reminder-mark">✳</span><p><strong>Leave yourself a copy.</strong> It’s been a little while since your last backup.</p><button onClick={exportBackup}>Make one now <span>↗</span></button><button className="reminder-close" aria-label="Dismiss backup reminder" onClick={() => setBackupDismissed(true)}>×</button></div>}

        <div className="view-tabs" role="tablist" aria-label="Choose period">{(Object.keys(viewLabels) as View[]).map((item) => <button role="tab" aria-selected={view === item} key={item} onClick={() => { setView(item); setMobileDestination(item === 'day' ? 'today' : 'stats') }} className={view === item ? 'active' : ''}>{viewLabels[item]}{view === item && <i className="tab-indicator" />}</button>)}<span className="tabs-hint">Use 1—4 to switch views</span></div>

        <div className="view-stage">
          {view === 'day' && <div key="day" className="view-panel view-panel-enter">
            <section className="hero-grid">
              <div className="timer-panel paper-panel">
                {focusMode && <button className="focus-exit" onClick={() => setFocusMode(false)}>Exit focus <span>Esc</span></button>}
                <div className="panel-topline"><span className="eyebrow">FOCUS IN SESSION</span><span className={`session-status ${timer.phase}`}>{timer.phase === 'running' ? <><i /> IN THE GROOVE</> : timer.phase === 'paused' ? 'Ⅱ ON PAUSE' : '○ READY WHEN YOU ARE'}</span></div>
                <div className="timer-inner">
                  <div className="timer-clock-wrap"><Ring progress={timerProgress} color={timer.phase === 'running' && remaining < timer.targetMs * .2 ? '#FF4F2E' : (activeActivity?.color ?? '#FF4F2E')} size={260} stroke={3} className={`timer-ring ${timer.phase === 'running' && remaining <= 10_000 ? 'timer-last-seconds' : ''}`}><span className="timer-ring-caption">{timer.phase === 'idle' ? 'SET YOUR PACE' : timer.phase === 'paused' ? 'PAUSED' : 'REMAINING'}</span><strong key={countdownText} className="timer-digit-change">{countdownText}</strong><small>{timer.phase === 'idle' ? settings.timerDisplayFormat === 'adaptive' ? 'DURATION' : settings.timerDisplayFormat.toUpperCase() : `${formatDurationAdaptive(timer.targetMs / 1000)} TARGET`}</small></Ring><div className="ring-orbit orbit-one" /><div className="ring-orbit orbit-two" /></div>
                  <div className="timer-description"><div className="activity-kicker"><span className="activity-color-dot" style={{ background: activeActivity?.color ?? '#FF4F2E' }} />{activeActivity?.category ?? 'A NEW CHAPTER'}</div><h2>{activeActivity?.name ?? 'Choose your next focus'}</h2><p>{activeActivity?.description || 'A little attention, given regularly, makes a remarkable difference.'}</p>
                    <div className="timer-duration"><span>Session length</span><div className="duration-options">{settings.timerPresetsSeconds.map((seconds) => <button key={seconds} onClick={() => { setDurationTouched(true); setDurationDraft(durationInputValue(seconds, effectiveTimerUnit)); if (timer.phase !== 'idle') void store.setTimerDuration(seconds / 60) }} className={Math.round((timer.phase === 'idle' ? durationValue * 60 : timer.targetMs / 1000)) === seconds ? 'selected' : ''}>{formatDurationAdaptive(seconds)}</button>)}<label className="custom-duration"><input aria-label="Custom timer duration" inputMode="decimal" value={durationDraft} onChange={(e) => { setDurationTouched(true); setDurationDraft(e.target.value); const seconds = parseDurationSeconds(e.target.value, effectiveTimerUnit); if (timer.phase !== 'idle' && seconds && seconds > 0) void store.setTimerDuration(seconds / 60) }} /><select aria-label="Custom timer unit" value={effectiveTimerUnit} onChange={(e) => setTimerDurationUnit(e.target.value as DurationUnit)}><option value="seconds">sec</option><option value="minutes">min</option><option value="hours">hr</option></select></label></div></div>
                    <div className="timer-actions">{timer.phase === 'running' ? <button className="button button-primary timer-primary" onClick={() => void store.pauseTimer()}><span>Ⅱ</span> Pause session</button> : <button className="button button-primary timer-primary" onClick={startFocus}><span>{timer.phase === 'paused' ? '▶' : '↗'}</span> {timer.phase === 'paused' ? 'Resume focus' : 'Start focusing'}</button>}{timer.phase !== 'idle' && <><button className="button button-outline" onClick={() => void store.addFiveMinutes()}>+5 min</button><button className="button button-quiet" onClick={() => { if (window.confirm('Reset this timer to the beginning? Elapsed time will be discarded.')) void store.resetTimer() }}>Reset</button><button className="button button-quiet focus-toggle" onClick={() => setFocusMode(true)}>⛶ Focus mode</button></>}</div>
                    {timer.phase !== 'idle' && selectedActivity && selectedActivity.id !== timer.activityId && <button className="button button-outline switch-focus" onClick={() => { if (!isFutureDay) void store.startTimer(selectedActivity, selectedActivity.defaultDuration).then((message) => { if (message) setToast(message) }) }}>{pausedTimers.some((item) => item.activityId === selectedActivity.id) ? 'Resume' : 'Switch to'} {selectedActivity.name}</button>}
                    {timer.phase !== 'idle' && <button className="early-finish" onClick={() => { const save = window.confirm('Save the elapsed focus time? Choose Cancel to discard this session.'); finishFromButton(save) }}>Finish early <span>·</span> Save or discard elapsed time</button>}
                  </div>
                </div>
              </div>
              <div className="day-summary paper-panel"><div className="panel-topline"><span className="eyebrow">THE DAILY PAGE</span><span className="streak-pill" title={`${currentStreak} day current streak`}>🔥 {currentStreak} day{currentStreak === 1 ? '' : 's'}{latestMilestone ? <b className="streak-badge" title={`${latestMilestone} day milestone`}>{latestMilestone}</b> : null}</span></div><div className="day-progress"><Ring progress={dayCompletionRatio} color="#FF4F2E" size={94} stroke={6}><strong>{currentSummary.doneCount}<small>/{currentSummary.totalCount}</small></strong></Ring><div><h3>{currentSummary.totalCount ? `${Math.round(dayCompletionRatio * 100)}%` : 'Open page'}</h3><p>{currentSummary.totalCount ? 'of today’s marks made' : 'Add a task to begin'}</p></div></div><div className="summary-divider" /><div className="summary-number-row"><div><span>PLANNED</span><strong>{formatDurationAdaptive(currentSummary.plannedMs / 1000)}</strong></div><div><span>FOCUSED</span><strong>{formatDurationAdaptive(currentSummary.actualMs / 1000)}</strong></div></div><div className="goal-label"><span>DAILY FOCUS GOAL</span><strong>{formatDurationAdaptive(currentSummary.actualMs / 1000)} / {formatDurationAdaptive(settings.dailyGoalMinutes * 60)}</strong></div><div className="goal-bar"><i style={{ width: `${dailyGoalProgress * 100}%` }} /></div><div className="goal-footnote">{dailyGoalProgress >= 1 ? 'Your daily goal is in the books.' : `${formatDurationAdaptive(Math.max(0, settings.dailyGoalMinutes * 60 - currentSummary.actualMs / 1000))} left to your goal`}</div></div>
            </section>

            <div className="section-heading"><div><span className="eyebrow">YOUR ROUTINE</span><h2>A few things worth showing up for<span className="heading-period">.</span></h2></div><button className="button button-outline add-button" onClick={() => setActivityDialog({ open: true, activity: null })}><span>＋</span> Add activity <kbd>N</kbd></button></div>
            <section className="activity-section" id="activities-section">
              <QuickAddBar activities={activities} defaultInputUnit={settings.defaultInputUnit} onAdd={(activity) => store.addActivity(activity).then(() => setToast(`${activity.name} added to today.`))} onError={() => setToast('Use a task with a duration, such as “Read paper 1h”.')} onSelect={(activity) => { setSelectedId(activity.id); setDurationDraft(durationInputValue(activity.defaultDuration * 60, effectiveTimerUnit)); setDurationTouched(false) }} />
              <div className="activity-toolbar"><div className="search-box"><span>⌕</span><input aria-label="Search activities" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an activity or note…" /></div><div className="toolbar-filters"><select aria-label="Filter category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>{filterOptions.map((option) => <option key={option}>{option}</option>)}</select><button className={`archive-filter ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Showing archived' : 'Archived'} <span>↗</span></button></div></div>
              {displayedActivities.length === 0 ? <div className="empty-state"><AtlasMascot mood="idle" size={58} /><h3>{search ? 'Nothing found in these margins.' : 'A clear page can be a good thing.'}</h3><p>{search ? 'Try another word, category, or note.' : 'Add a recurring activity or make a one-off note for this day.'}</p><button className="button button-primary" onClick={() => setActivityDialog({ open: true, activity: null })}>Add your first mark <span>↗</span></button></div> : <div className="activity-list">{displayedActivities.map((activity) => {
                const scheduled = currentSummary.scheduled.some((item) => item.id === activity.id)
                const done = currentSummary.doneCount > 0 && currentSummary.scheduled.some((item) => item.id === activity.id && (tasks.find((task) => task.id === `${item.id}:${date}`)?.completed || (currentSummary.minutesByActivity[item.id] ?? 0) >= (item.dailyTargetMinutes ?? item.defaultDuration) * 60_000))
                const skipped = tasks.find((task) => task.id === `${activity.id}:${date}`)?.skipped ?? false
                const actual = currentSummary.minutesByActivity[activity.id] ?? 0
                const targetMs = (activity.dailyTargetMinutes ?? activity.defaultDuration) * 60_000
                return <article key={activity.id} className={`activity-row ${done ? 'completed' : ''} ${skipped ? 'skipped' : ''} ${activity.archived ? 'archived' : ''} ${!scheduled ? 'unscheduled' : ''}`} style={{ '--activity-color': activity.color } as React.CSSProperties} onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => { const start = swipeStartX.current; swipeStartX.current = null; if (start === null || (event.target as HTMLElement).closest('button')) return; const delta = (event.changedTouches[0]?.clientX ?? start) - start; if (delta > 72) markTask(activity); else if (delta < -72) skipOccurrence(activity) }}>
                  <button className="task-check-button" aria-label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${activity.name}`} disabled={isFutureDay || !scheduled} onClick={() => markTask(activity)}><CheckMark checked={done} /></button><button className="activity-main" disabled={!activity.enabled || activity.archived} onClick={() => { setSelectedId(activity.id); setDurationDraft(durationInputValue(activity.defaultDuration * 60, effectiveTimerUnit)); setDurationTouched(false) }}><span className="activity-emoji">{activity.emoji}</span><span className="activity-copy"><strong title={activity.name}>{activity.name}</strong><small title={activity.description}>{activity.category} <i>·</i> {skipped ? 'Skipped this occurrence' : activity.description || (!activity.enabled ? 'Disabled' : `${formatDurationAdaptive(activity.defaultDuration * 60)} planned`)}</small></span></button><div className="activity-progress"><Ring progress={targetMs ? Math.min(1, actual / targetMs) : 0} color={activity.color} size={42} stroke={3}><small>{formatDurationAdaptive(actual / 1000)}</small></Ring><span>{Math.round(Math.min(1, actual / targetMs) * 100)}%</span></div><div className="activity-order"><button aria-label={`Move ${activity.name} up`} onClick={() => reorder(activity, -1)}>↑</button><button aria-label={`Move ${activity.name} down`} onClick={() => reorder(activity, 1)}>↓</button></div><button className="row-edit" aria-label={`Edit ${activity.name}`} onClick={() => setActivityDialog({ open: true, activity })}>···</button><button className="row-toggle" aria-label={`${activity.enabled ? 'Disable' : 'Enable'} ${activity.name}`} title={activity.enabled ? 'Disable activity' : 'Enable activity'} onClick={() => void store.saveActivity({ ...activity, enabled: !activity.enabled })}>{activity.enabled ? '◉' : '○'}</button><button className="row-archive" aria-label={`${activity.archived ? 'Restore' : 'Archive'} ${activity.name}`} title={activity.archived ? 'Restore activity' : 'Archive activity'} onClick={() => void store.saveActivity({ ...activity, archived: !activity.archived, enabled: activity.archived })}>{activity.archived ? '↶' : '⌑'}</button><button className="row-skip" aria-label={`${skipped ? 'Undo skip' : 'Skip'} ${activity.name} for ${date}`} disabled={isFutureDay || !scheduled} onClick={() => skipOccurrence(activity)}>{skipped ? 'Undo' : 'Skip'}</button><button className="row-time" aria-label={`Add manual time to ${activity.name}`} title="Add manual time" disabled={isFutureDay || !scheduled} onClick={() => setManualEntry(activity)}>＋<small>time</small></button>{activity.archived && <button className="row-delete" aria-label={`Delete ${activity.name}`} title="Delete permanently" onClick={() => { if (window.confirm(`Delete ${activity.name}? Past sessions will remain in your ledger.`)) { void store.deleteActivity(activity.id); if (selectedId === activity.id) setSelectedId('') } }}>⌫</button>}
                </article>
              })}</div>}
              {!showArchived && <div className="activity-footer"><span>✳</span> Small marks add up. Your schedule stays yours.</div>}
            </section>

            <section className="lower-grid"><div className="paper-panel distribution-panel"><div className="subpanel-heading"><div><span className="eyebrow">WHERE IT WENT</span><h3>Time by activity</h3></div><span className="panel-note">TODAY</span></div>{currentSummary.scheduled.length ? <div className="distribution-list">{currentSummary.scheduled.map((activity) => { const ms = currentSummary.minutesByActivity[activity.id] ?? 0; const pct = currentSummary.actualMs ? ms / currentSummary.actualMs * 100 : 0; return <div className="distribution-item" key={activity.id}><div className="distribution-label"><span style={{ background: activity.color }} />{activity.name}<strong>{Math.round(ms / 60_000)} min</strong></div><div className="distribution-track"><i style={{ width: `${pct}%`, background: activity.color }} /></div></div> })}</div> : <p className="quiet-empty">Your activity mix appears here after a session.</p>}</div>
              <div className="paper-panel timeline-panel"><div className="subpanel-heading"><div><span className="eyebrow">THE SESSION LOG</span><h3>Today, in moments</h3></div><button className="text-link" onClick={exportCSV}>Export ↗</button></div>{currentSummary.sessions.length ? <div className="timeline-list">{currentSummary.sessions.map((session) => { const activity = activities.find((item) => item.id === session.activityId); return <div className="timeline-item" key={session.id}><div className="timeline-marker" style={{ background: activity?.color ?? '#FF4F2E' }} /><span className="timeline-time">{formatLocalDate(session.localDate, 'MMM d', settings.timezone)} · {formatInTimeZone(session.startedAt, settings.timezone, 'HH:mm')}</span><strong>{activity?.name ?? 'Past activity'}</strong><small>{session.discarded ? 'Discarded' : `${formatDurationAdaptive(session.actualMs / 1000)} focused`} · {formatDurationAdaptive(session.plannedMs / 1000)} planned</small><div className="session-controls"><button aria-label={`Edit session for ${activity?.name ?? 'past activity'}`} onClick={() => editPastSession(session)}>Edit</button><button aria-label={`Delete session for ${activity?.name ?? 'past activity'}`} onClick={() => deletePastSession(session)}>Delete</button></div></div> })}</div> : <p className="quiet-empty">No sessions on this page yet. The first one is always the best one.</p>}</div></section>
            <div className="view-bottom-actions"><button className="text-link" onClick={exportCSV}>Download session history as CSV ↗</button><span>Past days can be edited. Future pages remain open.</span></div>
          </div>}

          {view === 'week' && <Suspense fallback={<div className="view-loading">Opening the weekly ledger…</div>}><WeekView date={date} today={today} settings={settings} onOpenDay={(day) => { setSelectedDate(day); setView('day') }} onToggle={markTask} /></Suspense>}
          {view === 'month' && <Suspense fallback={<div className="view-loading">Opening the monthly ledger…</div>}><MonthView date={date} today={today} settings={settings} monthDay={monthDay} setMonthDay={setMonthDay} onSelectDate={setSelectedDate} onOpenDay={(day) => { setSelectedDate(day); setView('day') }} onToggle={markTask} /></Suspense>}
          {view === 'year' && <Suspense fallback={<div className="view-loading">Opening the annual ledger…</div>}><YearView date={date} today={today} settings={settings} selectedId={selectedId} setSelectedId={setSelectedId} onOpenDay={(day) => { setSelectedDate(day); setView('day') }} onOpenMonth={(day) => { setSelectedDate(day); setView('month') }} /></Suspense>}
        </div>
      </div>
      <footer className="main-footer"><span>STUDY ATLAS <i>✳</i> A PERSONAL FIELD GUIDE TO YOUR TIME</span><button onClick={() => setSettingsOpen(true)}>Preferences & data ↗</button></footer>
    </main>

    <nav className="mobile-tabs" aria-label="Main navigation">
      <button className={mobileDestination === 'today' ? 'active' : ''} onClick={() => navigateMobile('today')}><CalendarDays aria-hidden="true" />Today</button>
      <button className={mobileDestination === 'activities' ? 'active' : ''} onClick={() => navigateMobile('activities')}><ListTodo aria-hidden="true" />Activities</button>
      <button className={mobileDestination === 'stats' ? 'active' : ''} onClick={() => navigateMobile('stats')}><BarChart3 aria-hidden="true" />Stats</button>
      <button className={mobileDestination === 'settings' ? 'active' : ''} onClick={() => navigateMobile('settings')}><Settings2 aria-hidden="true" />Settings</button>
    </nav>
    <button className="fab-add" aria-label="Add a task" onClick={() => setActivityDialog({ open: true, activity: null })}><Plus aria-hidden="true" /></button>
    {activityDialog.open && <ActivityForm key={activityDialog.activity?.id ?? 'new'} initial={activityDialog.activity} date={date} defaultInputUnit={settings.defaultInputUnit} onClose={() => setActivityDialog({ open: false, activity: null })} onSave={(activity) => { setSelectedId(activity.id); setDurationDraft(durationInputValue(activity.defaultDuration * 60, effectiveTimerUnit)); setDurationTouched(false); setActivityDialog({ open: false, activity: null }); void store.saveActivity(activity).catch(() => setToast('Could not save that activity. Try again.')) }} />}
    {manualEntry && <ManualTimeForm activity={manualEntry} date={date} timezone={settings.timezone} defaultInputUnit={settings.defaultInputUnit} onClose={() => setManualEntry(null)} onSave={(minutes) => { void store.addManualSession(manualEntry.id, date, minutes).then(() => setToast(`Added ${formatDurationAdaptive(minutes * 60)} of focused time.`)).catch(() => setToast('Could not save that time entry.')); setManualEntry(null) }} />}
    {settingsOpen && <SettingsPanel settings={settings} onClose={() => setSettingsOpen(false)} onSave={(next) => { void store.updateSettings(next); setSettingsOpen(false) }} onExport={() => void exportBackup()} onImport={(file) => void importFile(file)} onReset={resetAll} onShortcuts={() => setShortcutsOpen(true)} cloudConfigured={isCloudConfigured()} onCloudSignIn={requestCloudSignInLink} />}
    {shortcutsOpen && <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    {celebration && <div className="confetti-burst confetti-enter" aria-hidden="true"><AtlasMascot mood="cheering" size={72} /><span>✳</span><span>✦</span><span>✳</span><span>✦</span></div>}
    {toast && <div className="toast toast-enter" role="status"><span>✳</span>{toast}{deletedSession && <button className="toast-undo" onClick={undoDeleteSession}>Undo</button>}</div>}
  </div>
}

export default App
