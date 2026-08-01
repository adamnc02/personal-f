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
      // Anchored to #app-shell (position: relative) rather than the native
      // viewport. `fixed` on iOS standalone relies on WebKit's own internal
      // sense of the viewport, separate from any CSS/JS value, which can be
      // stale on first paint and leave the nav sitting in the wrong place
      // until a scroll forces a recompute. Anchoring to the shell instead
      // means the nav just follows normal layout against a box that's
      // already driven by --app-height, the same JS-measured value used
      // everywhere else — no separate viewport reference left to go stale.
      className="absolute bottom-0 left-0 right-0 flex items-stretch justify-around border-t backdrop-blur-lg z-40"
      style={{
        background: 'color-mix(in srgb, var(--color-bg-elevated) 92%, transparent)',
        borderColor: 'var(--color-track)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-2.5 px-3 flex-1 transition-colors ${
              isActive ? '' : 'opacity-60'
            }`
          }
          style={({ isActive }) => ({ color: isActive ? 'var(--color-coral)' : 'var(--color-ink-muted)' })}
        >
          <Icon size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium tracking-wide">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
