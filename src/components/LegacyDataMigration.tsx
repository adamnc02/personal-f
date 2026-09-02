import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadAppData } from '../lib/storage'
import type { AppData } from '../types/models'
import { useAppData } from '../context/AppContext'

const LEGACY_KEY = 'ledger:app-data:v1'

/**
 * Shown once, right after first sign-in, if this device still has data
 * from before cloud sync existed — same problem BLOC already solved for
 * itself, same fix here. AppContext no longer reads localStorage at all
 * once signed in (it's fully PowerSync-sourced), so without this, that
 * data just silently becomes invisible the moment someone signs in for
 * the first time — exactly what happened to Ella's phone during testing,
 * except there it was recoverable test data. For a real user with no
 * backup (Lewis), this is the actual fix, not just a nice-to-have.
 *
 * Only offers to import if the synced household is currently empty —
 * this never overwrites real data already synced on a device that's
 * been used with the new system before. Reuses AppContext's existing
 * setData() for the actual import — same id-remapping and clean-replace
 * logic already proven by the cloud-backup restore flow, not a second
 * parallel implementation.
 */
export function LegacyDataMigration() {
  const { data, setData } = useAppData()
  const [legacyData, setLegacyData] = useState<AppData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dismissed || legacyData) return
    const hasSyncedData =
      data.people.length > 0 || data.bills.length > 0 || data.loans.length > 0 || data.scenarios.length > 0
    if (hasSyncedData) return

    const legacy = loadAppData()
    if (!legacy) return

    // Skip devices that only ever had the untouched default template —
    // no real salary, no bills, no loans — so this never prompts someone
    // who never actually used the app locally.
    const isMeaningful =
      legacy.people.some((p) => p.salary.grossAnnual > 0) || legacy.bills.length > 0 || legacy.loans.length > 0
    if (isMeaningful) setLegacyData(legacy)
  }, [data, dismissed, legacyData])

  if (!legacyData || dismissed) return null

  const peopleCount = legacyData.people.length
  const summary = `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}, ${legacyData.bills.length} bill${legacyData.bills.length === 1 ? '' : 's'}, ${legacyData.loans.length} loan${legacyData.loans.length === 1 ? '' : 's'}`

  const handleUse = async () => {
    setImporting(true)
    setError(null)
    try {
      await setData(legacyData)
      localStorage.removeItem(LEGACY_KEY)
      setDismissed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import — please try again in a moment.')
    } finally {
      setImporting(false)
    }
  }

  const handleDiscard = () => {
    localStorage.removeItem(LEGACY_KEY)
    setDismissed(true)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div className="w-full max-w-sm rounded-3xl p-5" style={{ background: 'var(--color-surface)' }}>
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)] mb-2">Data found on this device</h2>
        <p className="text-sm text-[var(--color-ink-muted)] mb-4">
          Before signing in, this device had {summary} stored locally. Bring it into your account, or start fresh?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleUse}
            disabled={importing}
            className="w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60"
          >
            {importing ? 'Importing…' : 'Use this data'}
          </button>
          <button
            onClick={handleDiscard}
            disabled={importing}
            className="w-full py-3 rounded-2xl font-semibold text-[var(--color-ink)] disabled:opacity-60"
            style={{ background: 'var(--color-track)' }}
          >
            Start fresh
          </button>
        </div>
        {error && <p className="text-xs text-[var(--color-negative)] mt-3 text-center">{error}</p>}
      </div>
    </div>,
    document.body,
  )
}
