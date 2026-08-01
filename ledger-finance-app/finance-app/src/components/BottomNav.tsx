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
      className="fixed bottom-0 left-0 right-0 flex items-stretch justify-around border-t backdrop-blur-lg z-40"
      style={{
        background: 'color-mix(in srgb, var(--color-bg-elevated) 92%, transparent)',
        borderColor: 'var(--color-track)',
        paddingBottom: 'env(safe-area-inset-bottom)',
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
