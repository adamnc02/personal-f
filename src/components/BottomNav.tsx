import { NavLink } from 'react-router-dom'
import { Home, Wallet, Landmark, Receipt, FlaskConical } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/salary', label: 'Salary', icon: Wallet },
  { to: '/loans', label: 'Loans', icon: Landmark },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/scenarios', label: 'What-if', icon: FlaskConical },
]

export function BottomNav() {
  return (
    <nav
      // Same pill visual language (height, blur, border, shadow, radius) as
      // BLOC's #nav, but stretched to nearly the full screen width with
      // left/right padding instead of shrink-to-fit-content — and every
      // tab's label stays visible always, rather than BLOC's icon-only/
      // reveal-on-active treatment, which doesn't fit 5 always-legible tabs.
      //
      // Anchored to #app-shell (position: relative) rather than the native
      // viewport — see the comment history in this file's earlier version
      // for why `fixed` breaks on iOS standalone.
      className="absolute left-0 right-0 mx-3 flex items-stretch gap-0.5 rounded-full backdrop-blur-lg z-[100] border"
      style={{
        bottom: 'calc(var(--safe-bottom) - 6px)',
        height: 54,
        background: 'color-mix(in srgb, var(--color-bg-elevated) 92%, transparent)',
        borderColor: 'var(--color-track)',
        padding: 5,
        boxShadow: '0 14px 32px rgba(0,0,0,0.38), 0 2px 10px rgba(0,0,0,0.22)',
      }}
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex-1 flex items-center justify-center gap-1.5 rounded-full transition-colors ${isActive ? '' : 'opacity-70'}`
          }
          style={({ isActive }) => ({
            color: isActive ? '#fff' : 'var(--color-ink-muted)',
            background: isActive ? 'var(--color-coral)' : 'transparent',
          })}
        >
          <Icon size={18} strokeWidth={1.8} />
          <span className="text-[12.5px] font-semibold tracking-tight whitespace-nowrap">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
