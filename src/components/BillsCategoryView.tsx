import type { Bill } from '../types/models'

interface BillsCategoryViewProps {
  bills: Bill[]
  total: number
}

export function BillsCategoryView({ bills, total }: BillsCategoryViewProps) {
  const groups = new Map<string, Bill[]>()
  for (const bill of bills) {
    const key = bill.category || 'Uncategorized'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(bill)
  }

  const sortedGroups = Array.from(groups.entries()).sort(
    ([, a], [, b]) => b.reduce((s, x) => s + x.cost, 0) - a.reduce((s, x) => s + x.cost, 0)
  )

  return (
    <div className="w-full">
      {sortedGroups.map(([category, categoryBills]) => {
        const categoryTotal = categoryBills.reduce((s, b) => s + b.cost, 0)
        const sorted = categoryBills.slice().sort((a, b) => b.cost - a.cost)
        return (
          <div key={category} className="mb-5 last:mb-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{category}</span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">£{categoryTotal.toFixed(2)}</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--color-track)' }}>
              {sorted.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between py-2.5">
                  <span className="font-body text-[15px] text-[var(--color-ink)]">{bill.name}</span>
                  <span className="font-mono text-[15px] text-[var(--color-ink)] tabular-nums">£{bill.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between pt-4 mt-1 border-t-2" style={{ borderColor: 'var(--color-ink-faint)' }}>
        <span className="font-display text-[15px] font-semibold text-[var(--color-ink)]">Total</span>
        <span className="font-mono text-[15px] font-semibold text-[var(--color-ink)] tabular-nums">£{total.toFixed(2)}</span>
      </div>
    </div>
  )
}
