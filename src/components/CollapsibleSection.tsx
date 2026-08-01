import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function CollapsibleSection({ title, defaultOpen = true, children, className = '' }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={className}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1 mb-3"
        aria-expanded={open}
      >
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{title}</h2>
        {open ? (
          <ChevronUp size={16} className="text-[var(--color-ink-muted)]" />
        ) : (
          <ChevronDown size={16} className="text-[var(--color-ink-muted)]" />
        )}
      </button>
      {open && children}
    </section>
  )
}
