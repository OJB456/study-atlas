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
