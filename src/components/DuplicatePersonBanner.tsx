import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useAppData } from '../context/AppContext'
import { findDuplicatePeople, mergeDuplicatePerson } from '../lib/duplicates'

/**
 * Shows up when a "guess" person row (unclaimed, e.g. Adam's guess of
 * "Ella" before she'd ever linked) and a real linked row for the same
 * name both exist. Most likely to appear right after a household link —
 * see the redeem_household_link_code migration — but works from local
 * data alone, so it also catches the same situation however it arises.
 *
 * Never merges automatically. One tap re-parents the guess row's personal
 * bills/loans onto the real row and removes the guess row; dismissing
 * instead just hides it for this session (it'll resurface next load if
 * still unresolved) — no data is ever touched without the user choosing to.
 */
export function DuplicatePersonBanner() {
  const { data, replaceBills, replaceLoans, setData } = useAppData()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const matches = findDuplicatePeople(data).filter((m) => !dismissed.has(m.duplicate.id))

  if (matches.length === 0) return null

  const resolve = (duplicateId: string) => {
    const match = findDuplicatePeople(data).find((m) => m.duplicate.id === duplicateId)
    if (!match) return
    const result = mergeDuplicatePerson(data, match)
    replaceBills(result.bills)
    replaceLoans(result.loans)
    setData({ ...data, people: result.people, bills: result.bills, loans: result.loans })
  }

  const dismiss = (duplicateId: string) => {
    setDismissed((prev) => new Set(prev).add(duplicateId))
  }

  return (
    <div className="space-y-2 mb-4">
      {matches.map((match) => (
        <div
          key={match.duplicate.id}
          className="flex items-start gap-3 rounded-2xl border border-[var(--color-coral)]/40 bg-[var(--color-coral)]/10 px-4 py-3"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--color-coral)]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-ink)]">
              "{match.duplicate.name}" looks like a duplicate of {match.linked.name}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
              Any personal bills or loans on the duplicate will move to {match.linked.name}'s real record, then the
              duplicate is removed. Nothing joint is affected.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => resolve(match.duplicate.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--color-ink)] text-[var(--color-surface)]"
              >
                Merge & remove duplicate
              </button>
              <button
                onClick={() => dismiss(match.duplicate.id)}
                className="text-xs font-medium px-3 py-1.5 rounded-full text-[var(--color-ink-muted)]"
              >
                Dismiss for now
              </button>
            </div>
          </div>
          <button onClick={() => dismiss(match.duplicate.id)} aria-label="Dismiss" className="shrink-0">
            <X size={16} className="text-[var(--color-ink-muted)]" />
          </button>
        </div>
      ))}
    </div>
  )
}
