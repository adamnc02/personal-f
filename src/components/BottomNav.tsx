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
      // A floating pill rather than a full-width bar: the bar's own
      // background used to extend down through the safe-area reserve
      // (correct, but visually reads as "bar, then dead space below it").
      // Floating the pill above that zone instead — the way Monzo/WhatsApp
      // do it — means the reserved swipe-up area is just background, not
      // part of the bar's visible bounds at all.
      //
      // Anchored to #app-shell (position: relative) rather than the native
      // viewport. `fixed` on iOS standalone relies on WebKit's own internal
      // sense of the viewport, separate from any CSS/JS value, which can be
      // stale on first paint. Anchoring to the shell instead means the nav
      // just follows normal layout against a box that's already driven by
      // --app-height, the same JS-measured value used everywhere else.
      className="absolute left-1/2 flex items-stretch gap-0.5 rounded-full backdrop-blur-lg z-40 border"
      style={{
        bottom: 'calc(var(--safe-bottom) + 12px)',
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100% - 24px)',
        background: 'color-mix(in srgb, var(--color-bg-elevated) 92%, transparent)',
        borderColor: 'var(--color-track)',
        padding: '5px',
        boxShadow: '0 14px 32px rgba(0,0,0,0.38), 0 2px 10px rgba(0,0,0,0.22)',
      }}
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-2 px-3.5 rounded-full transition-colors ${isActive ? '' : 'opacity-60'}`
          }
          style={({ isActive }) => ({
            color: isActive ? '#fff' : 'var(--color-ink-muted)',
            background: isActive ? 'var(--color-coral)' : 'transparent',
          })}
        >
          <Icon size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium tracking-wide whitespace-nowrap">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
