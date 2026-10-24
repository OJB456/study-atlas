import { motion } from 'framer-motion'
import type { Activity, AppSettings } from '../model'
import { CheckMark, Ring } from '../components'
import { summarizeDay } from '../analytics'
import { formatLocalDate, isFuture, monthDates } from '../dates'
import { useAtlas } from '../store'
import { formatDurationAdaptive } from '../durations'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MonthView({ date, today, settings, monthDay, setMonthDay, onSelectDate, onOpenDay, onToggle }: { date: string; today: string; settings: AppSettings; monthDay: string; setMonthDay: (date: string) => void; onSelectDate: (date: string) => void; onOpenDay: (date: string) => void; onToggle: (activity: Activity, date?: string) => void }) {
  const { activities, tasks, sessions } = useAtlas()
  const month = monthDates(date)
  const inMonth = month.filter((day) => day.startsWith(date.slice(0, 7)))
  const summaries = inMonth.map((day) => summarizeDay(day, activities, tasks, sessions))
  const totalMinutes = summaries.reduce((sum, item) => sum + item.actualMs / 60_000, 0)
  const activeDays = summaries.filter((item) => item.actualMs > 0 || item.doneCount > 0)
  const average = activeDays.length ? Math.round(activeDays.reduce((sum, item) => sum + item.actualMs, 0) / activeDays.length / 60_000) : 0
  const completedTasks = summaries.reduce((sum, item) => sum + item.doneCount, 0)
  const weeklyTotals = Array.from({ length: month.length / 7 }, (_, weekIndex) => month.slice(weekIndex * 7, weekIndex * 7 + 7).filter((day) => day.startsWith(date.slice(0, 7))).reduce((total, day) => total + summarizeDay(day, activities, tasks, sessions).actualMs, 0))

  return <motion.div className="view-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
    <section className="month-layout"><div className="paper-panel calendar-panel"><div className="subpanel-heading"><div><span className="eyebrow">THE MONTH AT A GLANCE</span><h3>{formatLocalDate(date, 'MMMM yyyy', settings.timezone)}</h3></div><span className="panel-note">{activeDays.length} ACTIVE DAYS</span></div><div className="calendar-grid">{weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{month.map((day) => { const summary = summarizeDay(day, activities, tasks, sessions); const sameMonth = day.startsWith(date.slice(0, 7)); const future = isFuture(day, today); const ratio = summary.totalCount ? summary.doneCount / summary.totalCount : Math.min(1, summary.actualMs / 90_000_000); return <button key={day} className={`calendar-day ${sameMonth ? '' : 'outside-month'} ${day === today ? 'is-today' : ''} ${monthDay === day ? 'selected' : ''} ${future ? 'future-date' : ''}`} onClick={() => { if (!future) { setMonthDay(day); onSelectDate(day) } }} aria-label={`${formatLocalDate(day, 'MMMM d', settings.timezone)}, ${summary.doneCount} of ${summary.totalCount} tasks completed`}><span className="calendar-number">{Number(day.slice(-2))}</span>{!future && <Ring progress={ratio} color={summary.completion === 100 && summary.totalCount ? '#55B58E' : '#FF4F2E'} size={34} stroke={3}><small>{summary.totalCount ? `${summary.doneCount}/${summary.totalCount}` : summary.actualMs ? `${Math.round(summary.actualMs / 60_000)}′` : '·'}</small></Ring>}<i className="calendar-ink" style={{ opacity: future ? .08 : ratio * .75 }} /></button> })}</div><div className="calendar-legend"><span><i className="calendar-legend-mark" /> Completed task</span><span><i className="calendar-legend-mark active" /> Focus time</span><span>Future dates stay open</span></div></div>
      <aside className="month-side"><div className="paper-panel month-totals"><span className="eyebrow">MONTHLY TOTAL</span><h3>{formatDurationAdaptive(totalMinutes * 60)}</h3><p>intentional focus this month</p><div className="month-stat-row"><span>AVERAGE PER ACTIVE DAY</span><strong>{formatDurationAdaptive(average * 60)}</strong></div><div className="month-stat-row"><span>TASKS COMPLETED</span><strong>{completedTasks}</strong></div></div><div className="paper-panel date-detail"><span className="eyebrow">{monthDay ? 'A PAGE FROM THE ARCHIVE' : 'PICK A DAY'}</span>{monthDay ? <DayDetail date={monthDay} today={today} settings={settings} onToggle={onToggle} onOpenDay={() => onOpenDay(monthDay)} /> : <p>Choose any past date to see the work, sessions, and marks you left there.</p>}</div></aside></section>
    <section className="paper-panel month-trend-panel"><div className="subpanel-heading"><div><span className="eyebrow">MONTHLY RHYTHM</span><h3>Focus, week by week</h3></div><span className="panel-note">{weeklyTotals.length} WEEKS</span></div><div className="month-trend-bars">{weeklyTotals.map((milliseconds, index) => { const max = Math.max(...weeklyTotals, 60_000); return <div className="month-trend-item" key={index}><span className="month-trend-value">{milliseconds ? formatDurationAdaptive(milliseconds / 1000) : '—'}</span><div><i style={{ height: `${Math.max(2, milliseconds / max * 100)}%` }} /></div><small>WEEK {index + 1}</small></div> })}</div></section>
  </motion.div>
}

function DayDetail({ date, today, settings, onToggle, onOpenDay }: { date: string; today: string; settings: AppSettings; onToggle: (activity: Activity, date?: string) => void; onOpenDay: () => void }) {
  const { activities, tasks, sessions } = useAtlas()
  const summary = summarizeDay(date, activities, tasks, sessions)
  const future = isFuture(date, today)
  return <><h3>{formatLocalDate(date, 'EEEE, d MMMM', settings.timezone)}</h3><div className="detail-stats"><Ring progress={summary.totalCount ? summary.doneCount / summary.totalCount : 0} color="#FF4F2E" size={58} stroke={4}><strong>{summary.doneCount}</strong></Ring><div><strong>{summary.doneCount} of {summary.totalCount}</strong><small>tasks completed</small></div></div><p className="detail-focus">{Math.round(summary.actualMs / 60_000)} min focus · {summary.sessions.length} sessions</p>{summary.scheduled.length > 0 && <div className="detail-tasks">{summary.scheduled.map((activity) => <button key={activity.id} onClick={() => onToggle(activity, date)} disabled={future}><CheckMark checked={tasks.some((task) => task.activityId === activity.id && task.localDate === date && task.completed) || (summary.minutesByActivity[activity.id] ?? 0) >= (activity.dailyTargetMinutes ?? activity.defaultDuration) * 60_000} /><span>{activity.name}</span></button>)}</div>}<button className="text-link" onClick={onOpenDay}>Open this day ↗</button></>
}
