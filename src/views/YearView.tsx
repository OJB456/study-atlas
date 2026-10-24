import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { format, parseISO } from 'date-fns'
import type { AppSettings } from '../model'
import { rangeSummaries, scheduledStreaks, summarizeDay } from '../analytics'
import { formatLocalDate, isFuture, weekdayFor, yearDates } from '../dates'
import { useAtlas } from '../store'

export default function YearView({ date, today, settings, selectedId, setSelectedId, onOpenDay, onOpenMonth }: { date: string; today: string; settings: AppSettings; selectedId: string; setSelectedId: (id: string) => void; onOpenDay: (date: string) => void; onOpenMonth: (date: string) => void }) {
  const { activities, tasks, sessions } = useAtlas()
  const year = yearDates(Number(date.slice(0, 4)))
  const offset = year.length ? (weekdayFor(year[0]!) + 6) % 7 : 0
  const trailing = (7 - (offset + year.length) % 7) % 7
  const stats = rangeSummaries(year, activities, tasks, sessions)
  const yearsPrefix = date.slice(0, 4)
  const monthKeys = Array.from({ length: 12 }, (_, index) => `${yearsPrefix}-${String(index + 1).padStart(2, '0')}`)
  const monthTotals = monthKeys.map((key) => ({ key, minutes: stats.filter((item) => item.date.startsWith(key)).reduce((total, item) => total + item.actualMs / 60_000, 0) }))
  const maxMonth = Math.max(...monthTotals.map((item) => item.minutes), 1)
  const activeDays = stats.filter((item) => item.actualMs > 0 || item.doneCount > 0).length
  const focusMs = stats.reduce((sum, item) => sum + item.actualMs, 0)
  const completed = stats.reduce((sum, item) => sum + item.doneCount, 0)
  const visibleActivities = activities.filter((item) => !item.archived)
  const currentStreak = Math.max(0, ...visibleActivities.map((activity) => scheduledStreaks(activity, tasks, today).current))
  const longestStreak = Math.max(0, ...visibleActivities.map((activity) => scheduledStreaks(activity, tasks, today).longest))
  const categoryTotals = sessions.filter((session) => session.localDate.startsWith(yearsPrefix) && !session.discarded).reduce<Record<string, number>>((totals, session) => {
    const category = activities.find((activity) => activity.id === session.activityId)?.category ?? 'Past activity'
    totals[category] = (totals[category] ?? 0) + session.actualMs
    return totals
  }, {})
  const heatColor = activities.find((activity) => activity.id === selectedId)?.color ?? '#FF4F2E'
  const monthLabels = monthStarts(year)

  return <motion.div className="view-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
    <section className="paper-panel heatmap-panel"><div className="subpanel-heading"><div><span className="eyebrow">THE LONG VIEW</span><h3>{yearsPrefix} · days of practice</h3></div><label className="activity-heatmap-select">ACTIVITY VIEW<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">All activity</option>{visibleActivities.map((activity) => <option value={activity.id} key={activity.id}>{activity.name}</option>)}</select></label></div><div className="heatmap-months">{monthLabels.map((item) => <span key={item.name} style={{ gridColumn: item.column }}>{item.name}</span>)}</div><div className="heatmap-layout"><div className="heatmap-weekdays"><span>Mon</span><span>Wed</span><span>Fri</span></div><div className="heatmap-grid">{Array.from({ length: offset }, (_, index) => <i key={`leading-${index}`} className="heat-cell empty" />)}{year.map((day) => { const summary = summarizeDay(day, activities, tasks, sessions); const activityMs = selectedId ? summary.sessions.filter((session) => session.activityId === selectedId).reduce((sum, session) => sum + session.actualMs, 0) : summary.actualMs; const active = selectedId ? activityMs > 0 || tasks.some((task) => task.activityId === selectedId && task.localDate === day && task.completed) : summary.doneCount > 0 || summary.actualMs > 0; const future = isFuture(day, today); const level = !active || future ? 0 : activityMs > 7_200_000 ? 4 : activityMs > 3_600_000 ? 3 : activityMs > 1_800_000 ? 2 : 1; const style = { '--heat-color': heatColor } as CSSProperties; const title = `${formatLocalDate(day, 'EEE, d MMM yyyy', settings.timezone)} · ${future ? 'future' : `${Math.round(activityMs / 60_000)} min focus, ${summary.doneCount} tasks`}`; return <button key={day} className={`heat-cell heat-level-${level} ${future ? 'future' : ''}`} style={style} title={title} aria-label={`${day}, ${future ? 'future date' : `${Math.round(activityMs / 60_000)} minutes focused`}`} onClick={() => { if (!future) onOpenDay(day) }}><span className="sr-only">Intensity {level} of 4</span></button> })}{Array.from({ length: trailing }, (_, index) => <i key={`trailing-${index}`} className="heat-cell empty" />)}</div></div><div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i className={`heat-cell heat-level-${level}`} key={level} style={{ '--heat-color': heatColor } as CSSProperties} />)}<span>More</span><small>Fill and 0–4 level both show daily focus intensity.</small></div></section>
    <section className="year-metrics-grid"><div className="paper-panel year-total"><span className="eyebrow">ACTIVE DAYS</span><strong>{activeDays}</strong><span className="year-sub">days with a mark or focus session</span></div><div className="paper-panel year-total"><span className="eyebrow">FOCUS HOURS</span><strong>{(focusMs / 3_600_000).toFixed(1)}</strong><span className="year-sub">time spent with intention</span></div><div className="paper-panel year-total"><span className="eyebrow">TASKS COMPLETED</span><strong>{completed}</strong><span className="year-sub">completed scheduled activities</span></div><div className="paper-panel year-total"><span className="eyebrow">CURRENT STREAK</span><strong>{currentStreak}<small> days</small></strong><span className="year-sub">Longest scheduled streak: {longestStreak} days</span></div></section>
    <section className="year-breakdown-grid"><div className="paper-panel annual-trend-panel"><div className="subpanel-heading"><div><span className="eyebrow">MONTH TO MONTH</span><h3>How the year moved</h3></div><span className="panel-note">FOCUS HOURS</span></div><div className="annual-month-bars">{monthTotals.map((item) => <button key={item.key} title={`${format(parseISO(`${item.key}-01T12:00:00`), 'MMMM')}: ${(item.minutes / 60).toFixed(1)} hours`} onClick={() => onOpenMonth(`${item.key}-01`)}><span style={{ height: `${Math.max(2, item.minutes / maxMonth * 100)}%` }} /><small>{format(parseISO(`${item.key}-01T12:00:00`), 'MMM')}</small></button>)}</div></div><div className="paper-panel annual-category-panel"><div className="subpanel-heading"><div><span className="eyebrow">THE MAKEUP OF YOUR YEAR</span><h3>Focus by category</h3></div></div>{Object.entries(categoryTotals).length ? <div className="category-breakdown">{Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, milliseconds]) => { const maximum = Math.max(...Object.values(categoryTotals), 1); return <div className="category-breakdown-item" key={category}><div><span>{category}</span><strong>{(milliseconds / 3_600_000).toFixed(1)} h</strong></div><div className="distribution-track"><i style={{ width: `${milliseconds / maximum * 100}%`, background: 'var(--coral)' }} /></div></div> })}</div> : <p className="quiet-empty">Your category mix appears after a focus session.</p>}</div></section>
  </motion.div>
}

function monthStarts(dates: string[]): Array<{ name: string; column: number }> {
  const offset = dates.length ? (weekdayFor(dates[0]!) + 6) % 7 : 0
  const result: Array<{ name: string; column: number }> = []
  let lastMonth = ''
  dates.forEach((date, index) => {
    const month = date.slice(5, 7)
    if (month !== lastMonth) {
      result.push({ name: format(parseISO(`${date}T12:00:00`), 'MMM'), column: Math.floor((index + offset) / 7) + 1 })
      lastMonth = month
    }
  })
  return result
}
