import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { BottomNav } from './components/BottomNav'
import { Dashboard } from './pages/Dashboard'
import { Salary } from './pages/Salary'
import { Loans } from './pages/Loans'
import { Bills } from './pages/Bills'
import { Scenarios } from './pages/Scenarios'

function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/salary" element={<Salary />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/scenarios" element={<Scenarios />} />
          </Routes>
          <BottomNav />
        </div>
      </HashRouter>
    </AppProvider>
  )
}

export default App
