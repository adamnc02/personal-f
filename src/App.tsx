import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AppProvider, useAppData } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AuthGate } from './components/AuthGate'
import { BottomNav } from './components/BottomNav'
import { Dashboard } from './pages/Dashboard'
import { Salary } from './pages/Salary'
import { Loans } from './pages/Loans'
import { Bills } from './pages/Bills'
import { Scenarios } from './pages/Scenarios'
import { maybeUploadOpportunisticSnapshot } from './lib/backup'

/** #app-content is the app's only scroll container, so route changes need to reset its scroll manually. */
function ScrollToTop({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { pathname } = useLocation()
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 })
  }, [pathname, containerRef])
  return null
}

/**
 * Fires once per app load (not on every data edit — `attempted` guards
 * that) — same "opportunistic daily backup" idea as BLOC's own
 * maybeUploadOpportunisticSnapshot() call at boot. Silent, best-effort;
 * see backup.ts's own comment on why failures here are swallowed rather
 * than surfaced.
 */
function OpportunisticBackup() {
  const { session } = useAuth()
  const { data } = useAppData()
  const attempted = useRef(false)

  useEffect(() => {
    if (!session || attempted.current) return
    attempted.current = true
    maybeUploadOpportunisticSnapshot(session.user.id, data)
  }, [session, data])

  return null
}

function AppShell() {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <HashRouter>
      {/* The app shell is sized from --app-height (JS-measured in index.html,
          see the script there for why) rather than 100dvh/100vh directly, and
          is the single position:relative anchor the nav is positioned against —
          see BottomNav for why that matters on iOS standalone. */}
      <div
        id="app-shell"
        className="relative flex flex-col overflow-hidden"
        style={{ height: 'var(--app-height, 100dvh)', background: 'var(--color-bg)' }}
      >
        <div className="edge-fade edge-fade-top" />
        <div className="edge-fade edge-fade-bottom" />
        <div
          id="app-content"
          ref={contentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            paddingTop: 'var(--safe-top)',
            paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) - 6px + 20px)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <ScrollToTop containerRef={contentRef} />
          <OpportunisticBackup />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/salary" element={<Salary />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/scenarios" element={<Scenarios />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

/**
 * Mirrors BLOC's maybeFinalizeBoot()/onAuthResolved() gating: `session`
 * is `undefined` while the initial check is in flight (render nothing —
 * avoids a signed-out flash for an already-authenticated returning user),
 * `null` once resolved-but-signed-out (show the gate), or a real session
 * (render the app). AppProvider sits inside this, not outside, since the
 * app's own local data/UI has no reason to exist on screen at all until
 * there's a signed-in session — sign-in is mandatory, same as BLOC.
 */
function Gate() {
  const { session } = useAuth()

  if (session === undefined) return null
  if (session === null) return <AuthGate />

  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
