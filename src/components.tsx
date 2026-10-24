import type { ReactNode } from 'react'

export function Ring({ progress, color, size = 56, stroke = 5, children, className = '' }: { progress: number; color: string; size?: number; stroke?: number; children?: ReactNode; className?: string }) {
  const radius = (size - stroke) / 2
  const circumference = radius * Math.PI * 2
  return <div className={`ring ${className}`} style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle className="ring-fill" cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))} />
    </svg>
    <span>{children}</span>
  </div>
}

export function CheckMark({ checked }: { checked: boolean }) {
  return <svg className={`checkmark ${checked ? 'is-checked' : ''}`} viewBox="0 0 30 30" aria-hidden="true">
    <circle cx="15" cy="15" r="13" />
    <path d="m8 15 4.3 4.3L22 9.8" />
  </svg>
}

export function AtlasMascot({ mood = 'idle', size = 36 }: { mood?: 'idle' | 'focused' | 'cheering'; size?: number }) {
  return <svg className={`atlas-mascot mascot-${mood}`} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={mood === 'focused' ? 'Atlas is focused' : mood === 'cheering' ? 'Atlas is cheering' : 'Atlas says hello'}>
    <path d="M9 24c0-9 6-16 15-16s15 7 15 16-6 16-15 16S9 33 9 24Z" fill="#FFD84D" stroke="currentColor" strokeWidth="2.5" />
    <path d="M18 7 15 3m15 4 3-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {mood === 'idle' ? <path d="M17 22h4m6 0h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /> : <><circle cx="19" cy="21" r="2" fill="currentColor" /><circle cx="29" cy="21" r="2" fill="currentColor" /></>}
    <path d={mood === 'cheering' ? 'M19 28q5 7 10 0' : mood === 'focused' ? 'M20 30q4-3 8 0' : 'M20 29q4 4 8 0'} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {mood === 'cheering' && <path d="m5 14 3 1m32-1-3 1M7 33l3-1m28 1-3-1" stroke="#FF4F2E" strokeWidth="2.5" strokeLinecap="round" />}
  </svg>
}
