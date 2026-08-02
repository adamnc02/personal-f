import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppContext'
import { calculateScenarioImpact, mergeScenarios, resolveLoanAllocations, type ScenarioImpact } from '../lib/scenarios'
import { calculateNetSalary } from '../lib/tax'
import { personalBillsTotal, jointContributionForPerson } from '../lib/bills'
import { summarizeLoan, combineBillsWithLoans } from '../lib/loans'
import { totalMonthlySavingsForPerson } from '../lib/savings'
import { calculateFinanceAgreement } from '../lib/finance'
import { Plus, Trash2, ChevronDown, ChevronUp, Layers, Pencil } from 'lucide-react'
import type { Bill, Loan, Scenario, ScenarioActionType, BillLocation } from '../types/models'
import { SplitEditor } from '../components/SplitEditor'
import { nanoid } from 'nanoid'

const ACTION_LABELS: Record<ScenarioActionType, string> = {
  sell_asset: 'Sell an asset',
  pay_off_loan: 'Lump sum toward a loan',
  new_bill: 'New bill',
  new_finance_agreement: 'New finance agreement',
  exclude_loan: "Exclude a loan (what if it just didn't count)",
  loan_overpayment: 'Regular extra payment on a loan',
  salary_change: 'Salary change',
  savings_lump_sum: 'Lump sum toward a savings goal',
}

const NEEDS_VALUE: ScenarioActionType[] = ['sell_asset', 'pay_off_loan', 'new_bill', 'loan_overpayment', 'salary_change', 'savings_lump_sum']
const NEEDS_SPLIT: ScenarioActionType[] = ['new_bill', 'new_finance_agreement']

const VALUE_LABELS: Partial<Record<ScenarioActionType, string>> = {
  sell_asset: 'Sale value (£)',
  pay_off_loan: 'Lump sum (£)',
  new_bill: 'Monthly cost (£)',
  loan_overpayment: 'Extra per month (£)',
  salary_change: 'New gross annual salary (£)',
  savings_lump_sum: 'Lump sum (£)',
}

export function Scenarios() {
  const { data, addScenario, updateScenario, removeScenario } = useAppData()
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [combinedOpen, setCombinedOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  const me = data.people.find((p) => p.id === data.primaryPersonId) ?? data.people[0]
  const allBills = combineBillsWithLoans(data.bills, data.loans)

  const monthlyAvailableBefore = me
    ? calculateNetSalary(me.salary).netPerPeriod -
      personalBillsTotal(allBills, me.id) -
      jointContributionForPerson(allBills, me.id, data.people) -
      totalMonthlySavingsForPerson(me)
    : 0

  const includedScenarios = data.scenarios.filter((s) => s.includeInCumulative)
  const combinedImpact =
    me && includedScenarios.length > 0 ? calculateScenarioImpact(mergeScenarios(includedScenarios), data, me.id, monthlyAvailableBefore) : null

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">What-if scenarios</h1>
        <button
          onClick={() => setCreating(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-coral)' }}
        >
          <Plus size={18} className="text-white" />
        </button>
      </header>

      {combinedImpact && (
        <div className="rounded-2xl p-5 mb-6 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-coral)' }}>
          <button onClick={() => setCombinedOpen(!combinedOpen)} className="w-full flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Layers size={16} style={{ color: 'var(--color-coral)' }} />
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
                Combined ({includedScenarios.length} scenario{includedScenarios.length === 1 ? '' : 's'})
              </h2>
            </div>
            {combinedOpen ? (
              <ChevronUp size={18} className="text-[var(--color-ink-muted)]" />
            ) : (
              <ChevronDown size={18} className="text-[var(--color-ink-muted)]" />
            )}
          </button>
          {combinedOpen && (
            <div className="mt-3">
              <ImpactSummary impact={combinedImpact} viewerId={me?.id} />
            </div>
          )}
        </div>
      )}

      {creating && (
        <ScenarioForm
          people={data.people}
          onCancel={() => setCreating(false)}
          onSave={(s) => {
            addScenario(s)
            setCreating(false)
          }}
        />
      )}

      <div className="flex flex-col gap-4">
        {data.scenarios.map((scenario) => {
          if (editingId === scenario.id) {
            return (
              <ScenarioForm
                key={scenario.id}
                people={data.people}
                initial={scenario}
                onCancel={() => setEditingId(null)}
                onSave={(s) => {
                  updateScenario(scenario.id, s)
                  setEditingId(null)
                }}
              />
            )
          }

          const impact = me ? calculateScenarioImpact(scenario, data, me.id, monthlyAvailableBefore) : null
          const isOpen = expanded === scenario.id
          return (
            <div key={scenario.id} className="rounded-2xl p-5" style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isOpen ? null : scenario.id)}>
                <div>
                  <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{scenario.name}</h2>
                  <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                    {scenario.actions.length} action{scenario.actions.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingId(scenario.id)
                    }}
                    className="text-[var(--color-ink-faint)]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeScenario(scenario.id)
                    }}
                    className="text-[var(--color-ink-faint)]"
                  >
                    <Trash2 size={16} />
                  </button>
                  {isOpen ? <ChevronUp size={18} className="text-[var(--color-ink-muted)]" /> : <ChevronDown size={18} className="text-[var(--color-ink-muted)]" />}
                </div>
              </div>

              <label className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={scenario.includeInCumulative}
                  onChange={(e) => updateScenario(scenario.id, { includeInCumulative: e.target.checked })}
                />
                <span className="text-xs text-[var(--color-ink-muted)]">Include in combined view</span>
              </label>

              {isOpen && impact && (
                <div className="mt-4 pt-4 border-t flex flex-col gap-3" style={{ borderColor: 'var(--color-track)' }}>
                  {scenario.actions.map((action) => (
                    <div key={action.id} className="flex items-start justify-between text-sm gap-3">
                      <span className="text-[var(--color-ink-muted)]">
                        {action.name || ACTION_LABELS[action.type]}
                        {(() => {
                          const targets = resolveLoanAllocations(action)
                          if (targets.length === 0) return null
                          const parts = targets.map((t) => {
                            const loanName = data.loans.find((l) => l.id === t.loanId)?.name ?? 'loan'
                            return t.amount != null ? `${loanName} (£${t.amount.toFixed(2)})` : loanName
                          })
                          return ` → ${parts.join(' → ')}`
                        })()}
                        {action.type === 'new_finance_agreement' && action.termMonths ? (
                          <span className="block text-xs text-[var(--color-ink-faint)] mt-0.5">
                            £{(action.borrowAmount ?? 0).toFixed(2)} at {action.aprPercent ?? 0}% APR over {action.termMonths}mo · total £
                            {(action.totalRepayable ?? 0).toFixed(2)}
                          </span>
                        ) : null}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[var(--color-ink)]">£{action.value.toFixed(2)}</span>
                        {(action.type === 'new_bill' || action.type === 'new_finance_agreement') && (
                          <ConvertButtons action={action} people={data.people} />
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="h-px my-1" style={{ background: 'var(--color-track)' }} />

                  <ImpactSummary impact={impact} viewerId={me?.id} />
                </div>
              )}
            </div>
          )
        })}

        {data.scenarios.length === 0 && !creating && (
          <p className="text-sm text-[var(--color-ink-muted)] text-center py-10">
            No scenarios yet. Try modelling something like selling the car and putting the money toward a loan, or
            clearing a loan completely to see what it frees up.
          </p>
        )}
      </div>
    </div>
  )
}

function ConvertButtons({ action, people }: { action: Scenario['actions'][number]; people: { id: string; name: string }[] }) {
  const navigate = useNavigate()

  function toBill() {
    const billPrefill: Partial<Omit<Bill, 'id'>> = {
      name: action.name || 'New bill',
      cost: action.value,
      location: action.location ?? 'personal',
      ownerId: action.ownerId || people[0]?.id,
      payee: action.payee || people[0]?.id,
      payeeSharePercent: action.payeeSharePercent ?? 100,
    }
    navigate('/bills', { state: { billPrefill } })
  }

  function toLoan() {
    const loanPrefill: Partial<Omit<Loan, 'id'>> = {
      name: action.name || 'New finance agreement',
      totalAmount: action.totalRepayable ?? action.value * (action.termMonths ?? 1),
      monthlyPayment: action.value,
      location: action.location ?? 'personal',
      ownerId: action.ownerId || people[0]?.id,
      payee: action.payee || people[0]?.id,
      payeeSharePercent: action.payeeSharePercent ?? 100,
    }
    navigate('/loans', { state: { loanPrefill } })
  }

  if (action.type === 'new_finance_agreement') {
    return (
      <button onClick={toLoan} className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-coral)' }}>
        → Loan
      </button>
    )
  }

  return (
    <button onClick={toBill} className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-coral)' }}>
      → Bill
    </button>
  )
}

function ImpactSummary({ impact, viewerId }: { impact: ScenarioImpact; viewerId?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {impact.savingsImpacts.map((si, i) => (
        <div key={i} className="rounded-xl p-3" style={{ background: 'var(--color-bg-elevated)' }}>
          <p className="text-sm font-medium text-[var(--color-ink)] mb-2">
            {si.personName}'s {si.goalName}
          </p>
          <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
            <span>Lump sum</span>
            <span className="font-mono">£{si.lumpSumApplied.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
            <span>Remaining now</span>
            <span className="font-mono">£{si.originalRemaining.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
            <span>Remaining after</span>
            <span className="font-mono">£{si.newRemaining.toFixed(2)}</span>
          </div>
          {si.hasTargetDate ? (
            si.monthsSaved > 0 && (
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-positive)' }}>
                <span>Time saved</span>
                <span className="font-mono">{si.monthsSaved} month{si.monthsSaved === 1 ? '' : 's'}</span>
              </div>
            )
          ) : (
            <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">No target date set, so time saved can't be calculated.</p>
          )}
        </div>
      ))}

      {impact.salaryChangeImpact && (
        <div className="rounded-xl p-3" style={{ background: 'var(--color-bg-elevated)' }}>
          <p className="text-sm font-medium text-[var(--color-ink)] mb-2">{impact.salaryChangeImpact.personName}'s salary change</p>
          <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
            <span>Net pay now</span>
            <span className="font-mono">£{impact.salaryChangeImpact.oldNetMonthly.toFixed(2)}/mo</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
            <span>Net pay after</span>
            <span className="font-mono">£{impact.salaryChangeImpact.newNetMonthly.toFixed(2)}/mo</span>
          </div>
          {viewerId && impact.salaryChangeImpact.personId !== viewerId && (
            <p className="text-[11px] text-[var(--color-ink-faint)] mt-2 leading-relaxed">
              This doesn't count toward your own available cash below, since it's not your salary.
            </p>
          )}
        </div>
      )}

      {impact.loanImpacts.map((li) => (
        <div key={`${li.loanId}-${li.kind}`} className="rounded-xl p-3" style={{ background: 'var(--color-bg-elevated)' }}>
          <p className="text-sm font-medium text-[var(--color-ink)] mb-2">
            {li.loanName}
            {li.fullyPaidOff && (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-positive)' }}>
                Paid off
              </span>
            )}
            {li.kind === 'exclude' && (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ink-faint)' }}>
                Excluded
              </span>
            )}
            {li.kind === 'overpayment' && (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-coral)' }}>
                Overpaying
              </span>
            )}
          </p>

          {li.kind === 'payoff' && (
            <>
              <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
                <span>Remaining now</span>
                <span className="font-mono">£{li.originalRemaining.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
                <span>Remaining after</span>
                <span className="font-mono">£{li.newRemaining.toFixed(2)}</span>
              </div>
            </>
          )}

          {li.kind === 'exclude' && (
            <p className="text-xs text-[var(--color-ink-muted)]">
              Balance unchanged (£{li.originalRemaining.toFixed(2)}) — this just stops counting toward your monthly outgoings.
            </p>
          )}

          {li.kind === 'overpayment' && (
            <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
              <span>Extra per month</span>
              <span className="font-mono">£{li.overpaymentPerMonth.toFixed(2)}</span>
            </div>
          )}

          {li.monthsSaved > 0 && (
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-positive)' }}>
              <span>Time saved</span>
              <span className="font-mono">{li.monthsSaved} month{li.monthsSaved === 1 ? '' : 's'}</span>
            </div>
          )}
          {li.originalMonthlyCostForPerson !== li.newMonthlyCostForPerson && (
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-positive)' }}>
              <span>Your payment</span>
              <span className="font-mono">
                £{li.originalMonthlyCostForPerson.toFixed(2)} → £{li.newMonthlyCostForPerson.toFixed(2)}/mo
              </span>
            </div>
          )}
        </div>
      ))}

      <div className="rounded-xl p-3" style={{ background: 'var(--color-bg-elevated)' }}>
        <p className="text-sm font-medium text-[var(--color-ink)] mb-2">Impact on available cash</p>
        <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
          <span>Available now (per month)</span>
          <span className="font-mono">£{impact.monthlyAvailableBefore.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
          <span>Available after (per month)</span>
          <span className="font-mono">£{impact.monthlyAvailableAfter.toFixed(2)}</span>
        </div>
        {impact.monthlyImpact !== 0 && (
          <div className="flex justify-between text-xs mt-1" style={{ color: impact.monthlyImpact > 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
            <span>Change</span>
            <span className="font-mono">
              {impact.monthlyImpact > 0 ? '+' : '-'}£{Math.abs(impact.monthlyImpact).toFixed(2)}/mo
            </span>
          </div>
        )}

        <div className="h-px my-2" style={{ background: 'var(--color-track)' }} />

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-ink-muted)]">One-off cash impact</span>
          <span className="font-mono font-semibold" style={{ color: impact.oneOffCashImpact >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
            {impact.oneOffCashImpact >= 0 ? '+' : '-'}£{Math.abs(impact.oneOffCashImpact).toFixed(2)}
          </span>
        </div>
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-1 leading-relaxed">
          A single payment, not a monthly change, so it's kept separate from the figures above — whatever's left
          after every linked loan target and savings goal in this scenario has taken what it needs.
        </p>
      </div>
    </div>
  )
}

function ScenarioForm({
  people,
  initial,
  onSave,
  onCancel,
}: {
  people: { id: string; name: string }[]
  initial?: Scenario
  onSave: (s: Omit<Scenario, 'id'>) => void
  onCancel: () => void
}) {
  const { data } = useAppData()
  const [name, setName] = useState(initial?.name ?? '')
  const [actions, setActions] = useState<Scenario['actions']>(initial?.actions ?? [])
  const hasAnySavingsGoal = data.people.some((p) => p.savingsEntries.some((e) => e.type === 'goal'))

  function round2(n: number): number {
    return Math.round(n * 100) / 100
  }

  function addAction() {
    // If the previous action was a loan payoff/sale, default the new one's
    // value to whatever was left over after its target(s) were cleared —
    // you can still adjust it manually. With a single action now able to
    // cascade through several loans itself (see the loan picker below),
    // this mostly matters for chaining a genuinely separate action.
    const prev = actions[actions.length - 1]
    let defaultValue = 0
    if (prev && (prev.type === 'sell_asset' || prev.type === 'pay_off_loan') && prev.value > 0) {
      const targets = resolveLoanAllocations(prev)
      const totalNeeded = targets.reduce((sum, t) => {
        if (t.amount != null) return sum + t.amount // a manual override takes exactly that much, not the loan's full balance
        const loan = data.loans.find((l) => l.id === t.loanId)
        return sum + (loan ? summarizeLoan(loan).remaining : 0)
      }, 0)
      if (targets.length > 0) defaultValue = Math.max(0, round2(prev.value - totalNeeded))
    }
    setActions((p) => [...p, { id: nanoid(6), type: 'sell_asset', label: '', value: defaultValue }])
  }

  return (
    <div className="rounded-2xl p-4 mb-6 flex flex-col gap-3" style={{ background: 'var(--color-surface)' }}>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--color-ink-muted)]">Scenario name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sell the car, or Get furniture on finance"
          className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
        />
      </label>

      {actions.map((action, i) => {
        const currentTargets = resolveLoanAllocations(action)
        const totalNeededForTargets = currentTargets.reduce((sum, t) => {
          if (t.amount != null) return sum + t.amount
          const loan = data.loans.find((l) => l.id === t.loanId)
          return sum + (loan ? summarizeLoan(loan).remaining : 0)
        }, 0)
        const showMultiLoanPicker = action.type === 'sell_asset' || action.type === 'pay_off_loan'
        const showSingleLoanPicker = action.type === 'exclude_loan' || action.type === 'loan_overpayment'
        const showFullPayoffHint = showMultiLoanPicker && currentTargets.length > 0
        const showPersonPicker = action.type === 'salary_change' || action.type === 'savings_lump_sum'
        const showSavingsPicker = action.type === 'savings_lump_sum'
        const showValue = NEEDS_VALUE.includes(action.type)
        const showSplit = NEEDS_SPLIT.includes(action.type)
        const showFinanceInputs = action.type === 'new_finance_agreement'

        function updateAction(patch: Partial<Scenario['actions'][number]>) {
          setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
        }

        return (
          <div key={action.id} className="grid grid-cols-2 gap-2 rounded-xl p-3" style={{ background: 'var(--color-bg-elevated)' }}>
            <div className="col-span-2 flex items-center justify-between gap-2">
              <select
                value={action.type}
                onChange={(e) => updateAction({ type: e.target.value as ScenarioActionType })}
                className="flex-1 bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
              >
                {Object.entries(ACTION_LABELS)
                  .filter(([value]) => value !== 'savings_lump_sum' || hasAnySavingsGoal)
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
              <button onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))} className="text-[var(--color-ink-faint)]" title="Remove action">
                <Trash2 size={14} />
              </button>
            </div>

            {showSplit && (
              <input
                type="text"
                placeholder={action.type === 'new_finance_agreement' ? 'Name (e.g. Garden furniture finance)' : 'Name (e.g. Higher rent)'}
                value={action.name ?? ''}
                onChange={(e) => updateAction({ name: e.target.value })}
                className="col-span-2 bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
              />
            )}

            {showValue && (
              <input
                type="number"
                inputMode="decimal"
                placeholder={VALUE_LABELS[action.type] ?? 'Value (£)'}
                value={action.value || ''}
                onChange={(e) => updateAction({ value: Number(e.target.value) })}
                className={`bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm font-mono ${showMultiLoanPicker || showSingleLoanPicker || showPersonPicker ? '' : 'col-span-2'}`}
              />
            )}

            {showFinanceInputs && (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Amount to borrow (£)"
                  value={action.borrowAmount || ''}
                  onChange={(e) => {
                    const borrowAmount = Number(e.target.value)
                    const result = calculateFinanceAgreement({ borrowAmount, aprPercent: action.aprPercent ?? 0, termMonths: action.termMonths ?? 0 })
                    updateAction({ borrowAmount, value: result.monthlyPayment, totalRepayable: result.totalRepayable })
                  }}
                  className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm font-mono"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Term (months)"
                  value={action.termMonths || ''}
                  onChange={(e) => {
                    const termMonths = Number(e.target.value)
                    const result = calculateFinanceAgreement({ borrowAmount: action.borrowAmount ?? 0, aprPercent: action.aprPercent ?? 0, termMonths })
                    updateAction({ termMonths, value: result.monthlyPayment, totalRepayable: result.totalRepayable })
                  }}
                  className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm font-mono"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="Interest rate % (informational)"
                  value={action.interestRatePercent || ''}
                  onChange={(e) => updateAction({ interestRatePercent: Number(e.target.value) })}
                  className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm font-mono"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="APR %"
                  value={action.aprPercent || ''}
                  onChange={(e) => {
                    const aprPercent = Number(e.target.value)
                    const result = calculateFinanceAgreement({ borrowAmount: action.borrowAmount ?? 0, aprPercent, termMonths: action.termMonths ?? 0 })
                    updateAction({ aprPercent, value: result.monthlyPayment, totalRepayable: result.totalRepayable })
                  }}
                  className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm font-mono"
                />
                <p className="col-span-2 text-xs text-[var(--color-ink-muted)] -mt-1">
                  £{action.value.toFixed(2)}/month · £{(action.totalRepayable ?? 0).toFixed(2)} total repayable
                </p>
              </>
            )}

            {showPersonPicker && (
              <select
                value={action.personId || people[0]?.id || ''}
                onChange={(e) => updateAction({ personId: e.target.value, savingsEntryId: undefined })}
                className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            {showSavingsPicker &&
              (() => {
                const targetPersonId = action.personId || people[0]?.id || ''
                const goals = data.people.find((p) => p.id === targetPersonId)?.savingsEntries.filter((e) => e.type === 'goal') ?? []
                if (goals.length === 0) {
                  return (
                    <p className="col-span-2 text-xs text-[var(--color-ink-faint)]">
                      No savings goals for this person yet — add one on the Salary tab first.
                    </p>
                  )
                }
                return (
                  <select
                    value={action.savingsEntryId ?? ''}
                    onChange={(e) => updateAction({ savingsEntryId: e.target.value })}
                    className="col-span-2 bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
                  >
                    <option value="">Choose a savings goal…</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name || 'Unnamed goal'}
                      </option>
                    ))}
                  </select>
                )
              })()}

            {showSingleLoanPicker && (
              <select
                value={action.linkedLoanId ?? ''}
                onChange={(e) => updateAction({ linkedLoanId: e.target.value || undefined })}
                className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
              >
                <option value="">Choose a loan…</option>
                {data.loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}

            {showMultiLoanPicker && (
              <div className="col-span-2 flex flex-col gap-1.5">
                {currentTargets.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {currentTargets.map((target, idx) => {
                      const loan = data.loans.find((l) => l.id === target.loanId)
                      const autoAmount = Math.max(0, action.value - currentTargets.slice(0, idx).reduce((s, t) => s + (t.amount ?? (loan ? summarizeLoan(loan).remaining : 0)), 0))
                      function updateTarget(patch: Partial<{ loanId: string; amount?: number }>) {
                        const next = currentTargets.map((t, tIdx) => (tIdx === idx ? { ...t, ...patch } : t))
                        updateAction({ loanAllocations: next, linkedLoanId: undefined })
                      }
                      return (
                        <div key={target.loanId} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: 'var(--color-track)' }}>
                          <span className="text-[var(--color-ink)] flex-1">
                            {idx + 1}. {loan?.name ?? 'Unknown loan'}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder={`auto (£${Math.min(autoAmount, loan ? summarizeLoan(loan).remaining : 0).toFixed(2)})`}
                            value={target.amount ?? ''}
                            onChange={(e) => updateTarget({ amount: e.target.value === '' ? undefined : Number(e.target.value) })}
                            className="w-24 bg-transparent border-b border-[var(--color-ink-faint)] py-0.5 text-[var(--color-ink)] outline-none font-mono text-right"
                          />
                          <button
                            onClick={() => updateAction({ loanAllocations: currentTargets.filter((t) => t.loanId !== target.loanId), linkedLoanId: undefined })}
                            className="text-[var(--color-ink-faint)]"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    updateAction({ loanAllocations: [...currentTargets, { loanId: e.target.value }], linkedLoanId: undefined })
                  }}
                  className="bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
                >
                  <option value="">
                    {currentTargets.length === 0 ? 'No linked loan (optional)' : '+ Add another loan target…'}
                  </option>
                  {data.loans
                    .filter((l) => !currentTargets.some((t) => t.loanId === l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
                {currentTargets.length > 0 && (
                  <p className="text-[11px] text-[var(--color-ink-faint)]">
                    By default each target takes as much as it needs, in order — leave the amount blank for that. Type a number to
                    cap what goes to that one instead.
                  </p>
                )}
              </div>
            )}

            {showFullPayoffHint && (
              <button
                onClick={() => updateAction({ value: totalNeededForTargets })}
                className="col-span-2 text-xs font-medium text-left mt-1"
                style={{ color: 'var(--color-coral)' }}
              >
                Use total needed to clear {currentTargets.length > 1 ? 'all listed loans' : "the loan's remaining balance"} (£
                {totalNeededForTargets.toFixed(2)})
              </button>
            )}

            {showSplit && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--color-ink-muted)]">Location</span>
                <select
                  value={action.location ?? 'personal'}
                  onChange={(e) => {
                    const loc = e.target.value as BillLocation
                    updateAction(loc === 'joint' ? { location: loc, payee: action.payee || people[0]?.id } : { location: loc })
                  }}
                  className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
                >
                  <option value="personal">Personal</option>
                  <option value="joint">Joint</option>
                </select>
              </label>
            )}
            {showSplit && (action.location ?? 'personal') === 'personal' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--color-ink-muted)]">Owner</span>
                <select
                  value={action.ownerId || people[0]?.id || ''}
                  onChange={(e) => updateAction({ ownerId: e.target.value })}
                  className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none text-sm"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showSplit && action.location === 'joint' && (
              <SplitEditor
                people={people}
                payee={action.payee || people[0]?.id || ''}
                percent={action.payeeSharePercent ?? 50}
                onChangePayee={(payee) => updateAction({ payee })}
                onChangePercent={(payeeSharePercent) => updateAction({ payeeSharePercent })}
              />
            )}
          </div>
        )
      })}

      <button onClick={addAction} className="text-sm font-medium self-start" style={{ color: 'var(--color-coral)' }}>
        + Add action
      </button>

      <div className="flex gap-2 justify-end mt-1">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-ink-muted)]">
          Cancel
        </button>
        <button
          onClick={() => {
            if (!name.trim() || actions.length === 0) return
            onSave({
              name: name.trim(),
              includeInCumulative: initial?.includeInCumulative ?? true,
              actions: actions.map((a) => ({ ...a, label: ACTION_LABELS[a.type] })),
            })
          }}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-coral)', color: '#fff' }}
        >
          {initial ? 'Save changes' : 'Save scenario'}
        </button>
      </div>
    </div>
  )
}
