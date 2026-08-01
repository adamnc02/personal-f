import type { Bill, Person } from '../types/models'
import { jointSplitLabel } from '../lib/bills'

function ordinal(n: number): string {
  if (n <= 0) return 'Monthly'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

interface BillsTableProps {
  bills: Bill[]
  people: Person[]
  showSplit?: boolean
  total: number
}

export function BillsTable({ bills, people, showSplit, total }: BillsTableProps) {
  const sorted = bills.slice().sort((a, b) => b.cost - a.cost)

  return (
    <div className="w-full">
      <div className="divide-y" style={{ borderColor: 'var(--color-track)' }}>
        {sorted.map((bill) => (
          <div key={bill.id} className="flex items-center justify-between py-3">
            <div className="flex flex-col">
              <span className="font-body text-[15px] text-[var(--color-ink)]">{bill.name}</span>
              <span className="font-mono text-xs text-[var(--color-ink-faint)]">
                {ordinal(bill.dueDay)}
                {showSplit ? ` · ${jointSplitLabel(bill, people)}` : ''}
              </span>
            </div>
            <span className="font-mono text-[15px] text-[var(--color-ink)] tabular-nums">£{bill.cost.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-4 mt-1 border-t-2" style={{ borderColor: 'var(--color-ink-faint)' }}>
        <span className="font-display text-[15px] font-semibold text-[var(--color-ink)]">Total</span>
        <span className="font-mono text-[15px] font-semibold text-[var(--color-ink)] tabular-nums">£{total.toFixed(2)}</span>
      </div>
    </div>
  )
}
