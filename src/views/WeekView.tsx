import { motion } from 'framer-motion'
import type { Activity, AppSettings, FocusSession, TaskRecord } from '../model'
import { CheckMark } from '../components'
import { rangeSummaries, summarizeDay } from '../analytics'
import { formatLocalDate, isFuture, movePeriod, weekdayFor, weekDates } from '../dates'
import { useAtlas } from '../store'
import { formatDurationAdaptive } from '../durations'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeekView({ date, today, settings, onOpenDay, onToggle }: { date: string; today: string; settings: AppSettings; onOpenDay: (date: string) => void; onToggle: (activity: Activity, date?: string) => void }) {
  const { activities, tasks, sessions } = useAtlas()
  const week = weekDates(date, settings.weekStartsOn)
  const weekStats = rangeSummaries(week, activities, tasks, sessions)
  const previousWeek = weekDates(movePeriod(date, 'week', -1), settings.weekStartsOn)
  const previousWeekStats = rangeSummaries(previousWeek, activities, tasks, sessions)
  const totalFocus = weekStats.reduce((sum, item) => sum + item.actualMs, 0)
  const previousFocus = previousWeekStats.reduce((sum, item) => sum + item.actualMs, 0)
  const totalDone = weekStats.reduce((sum, item) => sum + item.doneCount, 0)
  const totalTasks = weekStats.reduce((sum, item) => sum + item.totalCount, 0)
  const bestDay = weekStats.reduce((best, item) => item.actualMs > best.actualMs ? item : best, weekStats[0]!)
  const categoryTotals = sessions.filter((session) => week.includes(session.localDate) && !session.discarded).reduce<Record<string, number>>((totals, session) => {
    const category = activities.find((activity) => activity.id === session.activityId)?.category ?? 'Past activity'
    totals[category] = (totals[category] ?? 0) + session.actualMs
    return totals
  }, {})

  return <motion.div className="view-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
    <section className="week-top-grid"><div className="paper-panel week-matrix-panel"><div className="subpanel-heading"><div><span className="eyebrow">THE WEEKLY PRACTICE</span><h3>Marks across the week</h3></div><span className="panel-note">{totalDone} COMPLETED</span></div><div className="matrix-wrap"><div className="matrix-grid"><div className="matrix-corner">ACTIVITY</div>{week.map((day) => <div key={day} className={`matrix-day ${day === today ? 'is-today' : ''}`}><span>{weekdays[(weekdayFor(day) + 6) % 7]}</span><strong>{day.slice(-2)}</strong></div>)}{activities.filter((item) => !item.archived).map((activity) => <MatrixRow key={activity.id} activity={activity} week={week} today={today} tasks={tasks} sessions={sessions} onToggle={onToggle} />)}</div></div><p className="matrix-legend"><span className="legend-box" /> No time <span className="legend-box partial" /> Some focus <span className="legend-box full" /> Complete</p></div>
      <div className="paper-panel weekly-summary"><span className="eyebrow">YOUR WEEK WRAPPED ✳</span><h3>{formatDurationAdaptive(totalFocus / 1000)}</h3><p>of intentional focus. Small steps, real momentum.</p><div className="weekly-metrics"><div><span>DAILY AVERAGE</span><strong>{formatDurationAdaptive(totalFocus / 7 / 1000)}</strong></div><div><span>COMPLETION</span><strong>{totalTasks ? `${Math.round(totalDone / totalTasks * 100)}%` : '—'}<small> · {totalDone}/{totalTasks}</small></strong></div><div><span>BEST DAY</span><strong>{bestDay.actualMs ? formatLocalDate(bestDay.date, 'EEE', settings.timezone) : '—'}</strong></div><div><span>VS LAST WEEK</span><strong className={totalFocus >= previousFocus ? 'positive' : ''}>{totalFocus >= previousFocus ? '+' : '−'}{formatDurationAdaptive(Math.abs(totalFocus - previousFocus) / 1000)}</strong></div></div></div></section>
    <section className="paper-panel bars-panel"><div className="subpanel-heading"><div><span className="eyebrow">A STEADY RHYTHM</span><h3>Seven days of focus</h3></div><span className="panel-note">ZERO DAYS INCLUDED</span></div><div className="week-bars">{weekStats.map((item) => { const max = Math.max(...weekStats.map((x) => x.actualMs), 60_000); return <button key={item.date} onClick={() => onOpenDay(item.date)} className={`week-bar-item ${item.date === today ? 'is-today' : ''}`}><span className="week-bar-value">{item.actualMs ? formatDurationAdaptive(item.actualMs / 1000) : '—'}</span><div className="week-bar-track"><i style={{ height: `${Math.max(2, item.actualMs / max * 100)}%` }} /></div><strong>{formatLocalDate(item.date, 'EEE', settings.timezone)}</strong><small>{item.date.slice(-2)}</small></button> })}</div></section>
    <section className="paper-panel category-week-panel"><div className="subpanel-heading"><div><span className="eyebrow">A BALANCED PRACTICE</span><h3>Focus by category</h3></div><span className="panel-note">THIS WEEK</span></div>{Object.entries(categoryTotals).length ? <div className="category-breakdown">{Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, milliseconds]) => { const maximum = Math.max(...Object.values(categoryTotals), 1); return <div className="category-breakdown-item" key={category}><div><span>{category}</span><strong>{(milliseconds / 3_600_000).toFixed(1)} h</strong></div><div className="distribution-track"><i style={{ width: `${milliseconds / maximum * 100}%`, background: 'var(--cobalt)' }} /></div></div> })}</div> : <p className="quiet-empty">Category totals appear after a focus session.</p>}</section>
  </motion.div>
}

function MatrixRow({ activity, week, today, tasks, sessions, onToggle }: { activity: Activity; week: string[]; today: string; tasks: TaskRecord[]; sessions: FocusSession[]; onToggle: (activity: Activity, date?: string) => void }) {
  return <><div className="matrix-activity" title={activity.name}><span style={{ background: activity.color }} />{activity.name}</div>{week.map((day) => { const summary = summarizeDay(day, [activity], tasks, sessions); const done = summary.doneCount > 0; const actual = summary.minutesByActivity[activity.id] ?? 0; const partial = actual > 0 && !done; return <button key={`${activity.id}-${day}`} disabled={isFuture(day, today) || !activity.enabled} className={`matrix-cell ${done ? 'done' : ''} ${partial ? 'partial' : ''} ${day === today ? 'is-today' : ''}`} onClick={() => onToggle(activity, day)} aria-label={`${activity.name} on ${day}: ${done ? 'complete' : partial ? `${formatDurationAdaptive(actual / 1000)} focused` : 'not complete'}`}><CheckMark checked={done} />{partial && <i style={{ width: `${Math.min(100, actual / (activity.defaultDuration * 60_000) * 100)}%`, background: activity.color }} />}</button> })}</>
}
