import { useRef, useState } from 'react'
import { useAppData } from '../context/AppContext'
import { calculateNetSalary, type StudentLoanPlan, type PayFrequency, type SalaryDeduction, type DeductionType } from '../lib/tax'
import { monthlyAmountForEntry } from '../lib/savings'
import { downloadFullBackup, parseFullBackupJson } from '../lib/storage'
import { Plus, Trash2, Download, Upload, Link2 } from 'lucide-react'
import type { AppData, Person, SavingsEntry } from '../types/models'
import { nanoid } from 'nanoid'
import { DeductionModal } from '../components/DeductionModal'
import { LinkHouseholdModal } from '../components/LinkHouseholdModal'
import { AccountModal, ChangePasswordModal, AccountIcon } from '../components/AccountModal'

const STUDENT_LOAN_LABELS: Record<StudentLoanPlan, string> = {
  none: 'No student loan',
  plan1: 'Plan 1',
  plan2: 'Plan 2',
  plan4: 'Plan 4',
  plan5: 'Plan 5',
  postgrad: 'Postgraduate loan',
}

export function Salary() {
  const { data, setData, updatePerson, addPerson, removePerson, setAsMe } = useAppData()
  const [addingPerson, setAddingPerson] = useState(false)
  const [editingDeduction, setEditingDeduction] = useState<{ personId: string; deductionId: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">Salary</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAccountModalOpen(true)}
            aria-label="Account"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface)' }}
          >
            <AccountIcon size={18} className="text-[var(--color-ink)]" />
          </button>
          <button
            onClick={() => setLinkModalOpen(true)}
            aria-label="Link household"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface)' }}
          >
            <Link2 size={16} className="text-[var(--color-ink)]" />
          </button>
          <button
            onClick={() => setAddingPerson(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface)' }}
          >
            <Plus size={18} className="text-[var(--color-ink)]" />
          </button>
        </div>
      </header>

      <LinkHouseholdModal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} />
      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        onOpenChangePassword={() => {
          setAccountModalOpen(false)
          setChangePasswordOpen(true)
        }}
      />
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />

      <BackupSection data={data} onRestore={setData} />

      {addingPerson && (
        <div className="rounded-2xl p-4 mb-6 flex gap-2" style={{ background: 'var(--color-surface)' }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="flex-1 bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
          />
          <button
            onClick={() => {
              if (!newName.trim()) return
              addPerson({
                name: newName.trim(),
                color: '#7c6fe0',
                salary: {
                  grossAnnual: 0,
                  taxCode: '1257L',
                  studentLoanPlan: 'none',
                  payFrequency: 'monthly',
                  deductions: [],
                },
                savingsEntries: [],
              })
              setNewName('')
              setAddingPerson(false)
            }}
            className="px-3 rounded-lg font-medium text-sm"
            style={{ background: 'var(--color-coral)', color: '#fff' }}
          >
            Add
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {data.people.map((person) => {
          const breakdown = calculateNetSalary(person.salary)
          const periodLabel = person.salary.payFrequency === 'four_weekly' ? 'every 4 weeks' : 'monthly'

          function updateDeductions(deductions: SalaryDeduction[]) {
            updatePerson(person.id, { salary: { ...person.salary, deductions } })
          }
          function addDeduction() {
            const id = nanoid(6)
            updateDeductions([...person.salary.deductions, { id, name: '', type: 'relief_at_source', amountType: 'percent', amount: 0 }])
            setEditingDeduction({ personId: person.id, deductionId: id })
          }
          function updateDeduction(id: string, patch: Partial<SalaryDeduction>) {
            updateDeductions(person.salary.deductions.map((d) => (d.id === id ? { ...d, ...patch } : d)))
          }
          function removeDeduction(id: string) {
            updateDeductions(person.salary.deductions.filter((d) => d.id !== id))
          }
          function moveDeduction(id: string, direction: -1 | 1) {
            const list = person.salary.deductions
            const idx = list.findIndex((d) => d.id === id)
            const swapWith = idx + direction
            if (idx < 0 || swapWith < 0 || swapWith >= list.length) return
            const next = list.slice()
            ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
            updateDeductions(next)
          }

          const isPrimary = person.id === data.primaryPersonId

          return (
            <div key={person.id} className="rounded-2xl p-5" style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{person.name}</h2>
                  <button
                    onClick={() => setAsMe(person.id)}
                    disabled={isPrimary}
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors"
                    style={{
                      background: isPrimary ? 'var(--color-coral)' : 'var(--color-bg-elevated)',
                      color: isPrimary ? '#fff' : 'var(--color-ink-muted)',
                    }}
                    title={
                      isPrimary
                        ? 'This is your dashboard view, and this row is linked to your account'
                        : 'Claim this row as yourself — links it to your account and switches your dashboard view to it'
                    }
                  >
                    {isPrimary ? 'Me' : 'Set as me'}
                  </button>
                </div>
                {data.people.length > 1 && (
                  <button onClick={() => removePerson(person.id)} className="text-[var(--color-ink-faint)]">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <Field label="Gross annual salary (£)">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={person.salary.grossAnnual || ''}
                    onChange={(e) => updatePerson(person.id, { salary: { ...person.salary, grossAnnual: Number(e.target.value) } })}
                    className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none font-mono"
                  />
                </Field>
                <Field label="Tax code">
                  <input
                    value={person.salary.taxCode}
                    onChange={(e) => updatePerson(person.id, { salary: { ...person.salary, taxCode: e.target.value } })}
                    className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none font-mono uppercase"
                  />
                </Field>
                <Field label="Student loan">
                  <select
                    value={person.salary.studentLoanPlan}
                    onChange={(e) => updatePerson(person.id, { salary: { ...person.salary, studentLoanPlan: e.target.value as StudentLoanPlan } })}
                    className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
                  >
                    {Object.entries(STUDENT_LOAN_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Paid">
                  <select
                    value={person.salary.payFrequency}
                    onChange={(e) => updatePerson(person.id, { salary: { ...person.salary, payFrequency: e.target.value as PayFrequency } })}
                    className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
                  >
                    <option value="monthly">Monthly (12/yr)</option>
                    <option value="four_weekly">Every 4 weeks (13/yr)</option>
                  </select>
                </Field>
                <Field label="Employer pension %">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={person.salary.employerPensionPercent || ''}
                    onChange={(e) => updatePerson(person.id, { salary: { ...person.salary, employerPensionPercent: Number(e.target.value) } })}
                    placeholder="0"
                    className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none font-mono"
                  />
                </Field>
              </div>

              {/* Deductions list — order here is payroll order: percentage lines are each
                  calculated against the original gross, but which run before/after tax
                  and NI is determined by each one's type, not its position in the list. */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-body text-sm font-semibold text-[var(--color-ink)]">Deductions</h3>
                  <button onClick={addDeduction} className="text-xs font-medium" style={{ color: 'var(--color-coral)' }}>
                    + Add deduction
                  </button>
                </div>
                {person.salary.deductions.length === 0 && (
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    None yet — add pension contributions or anything else that comes off your pay, e.g. a Holiday
                    Purchase Scheme or a workplace lottery.
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  {person.salary.deductions.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setEditingDeduction({ personId: person.id, deductionId: d.id })}
                      className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left"
                      style={{ background: 'var(--color-bg-elevated)' }}
                    >
                      <span className="text-sm text-[var(--color-ink)]">{d.name || 'Unnamed deduction'}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-sm text-[var(--color-ink-muted)]">
                          {d.amountType === 'percent'
                            ? `${d.amount}%${d.percentBasis === 'qualifying_earnings' ? ' QE' : ''}`
                            : `£${d.amount.toFixed(2)}`}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeDeduction(d.id)
                          }}
                          className="text-[var(--color-ink-faint)]"
                        >
                          <Trash2 size={14} />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {editingDeduction?.personId === person.id &&
                  (() => {
                    const idx = person.salary.deductions.findIndex((d) => d.id === editingDeduction.deductionId)
                    const d = person.salary.deductions[idx]
                    if (!d) return null
                    return (
                      <DeductionModal
                        deduction={d}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < person.salary.deductions.length - 1}
                        onChange={(patch) => updateDeduction(d.id, patch)}
                        onMove={(direction) => moveDeduction(d.id, direction)}
                        onDelete={() => {
                          removeDeduction(d.id)
                          setEditingDeduction(null)
                        }}
                        onClose={() => setEditingDeduction(null)}
                      />
                    )
                  })()}
              </div>

              {/* Running-total breakdown, mirroring a real payslip's layout */}
              <div className="rounded-xl p-4 mt-2" style={{ background: 'var(--color-bg-elevated)' }}>
                <BreakdownRow label="Gross salary" value={breakdown.grossPerPeriod} bold />
                {breakdown.preTaxDeductions.map((d) => (
                  <BreakdownRow key={d.id} label={`${d.name || 'Deduction'} (${DEDUCTION_TYPE_SHORT[d.type]})`} value={-d.amountPerPeriod} />
                ))}
                {breakdown.preTaxDeductions.length > 0 && (
                  <>
                    <div className="h-px my-2" style={{ background: 'var(--color-track)' }} />
                    <BreakdownRow label="Gross taxable" value={breakdown.grossTaxablePerPeriod} bold />
                  </>
                )}
                <BreakdownRow label="Income tax" value={-breakdown.incomeTaxPerPeriod} />
                <BreakdownRow label="National Insurance" value={-breakdown.nationalInsurancePerPeriod} />
                {breakdown.studentLoanPerPeriod > 0 && <BreakdownRow label="Student loan" value={-breakdown.studentLoanPerPeriod} />}
                {breakdown.postTaxDeductions.map((d) => (
                  <BreakdownRow key={d.id} label={d.name || 'Deduction'} value={-d.amountPerPeriod} />
                ))}
                <div className="h-px my-2" style={{ background: 'var(--color-track)' }} />
                <BreakdownRow label={`Net pay (${periodLabel})`} value={breakdown.netPerPeriod} emphasized />
                {(person.salary.employerPensionPercent ?? 0) > 0 && (
                  <p className="text-xs text-[var(--color-ink-faint)] mt-2">
                    Your employer separately contributes £{breakdown.employerPensionContributionPerPeriod.toFixed(2)} (
                    {person.salary.employerPensionPercent}%) into your pension — this isn't part of your pay.
                  </p>
                )}
              </div>

              <SavingsSection
                person={person}
                onUpdate={(savingsEntries) => updatePerson(person.id, { savingsEntries })}
              />
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[var(--color-ink-faint)] mt-6 leading-relaxed">
        Estimates use 2026/27 UK tax year rates, calculated as annual ÷ pay periods. Real payroll uses HMRC's
        cumulative period-by-period PAYE tables, so expect results within pennies of a real payslip rather than an
        exact match. Doesn't account for multiple jobs, benefits in kind, or higher/additional-rate pension relief
        reclaimed via Self Assessment.
      </p>
    </div>
  )
}

const DEDUCTION_TYPE_SHORT: Record<DeductionType, string> = {
  salary_sacrifice: 'salary sacrifice',
  net_pay: 'net pay',
  relief_at_source: 'relief at source',
  post_tax: 'post-tax',
}

function SavingsSection({ person, onUpdate }: { person: Person; onUpdate: (entries: SavingsEntry[]) => void }) {
  const entries = person.savingsEntries ?? []

  function updateEntry(id: string, patch: Partial<SavingsEntry>) {
    onUpdate(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }
  function removeEntry(id: string) {
    onUpdate(entries.filter((e) => e.id !== id))
  }
  function addEntry(type: 'goal' | 'plan') {
    const base: SavingsEntry =
      type === 'goal'
        ? { id: nanoid(6), type: 'goal', name: '', includeInSummary: false, targetAmount: 0, currentAmount: 0, targetDate: '' }
        : { id: nanoid(6), type: 'plan', name: '', includeInSummary: false, monthlyAmount: 0 }
    onUpdate([...entries, base])
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-body text-sm font-semibold text-[var(--color-ink)]">Savings</h3>
        <div className="flex gap-3">
          <button onClick={() => addEntry('plan')} className="text-xs font-medium" style={{ color: 'var(--color-coral)' }}>
            + Monthly plan
          </button>
          <button onClick={() => addEntry('goal')} className="text-xs font-medium" style={{ color: 'var(--color-coral)' }}>
            + Goal
          </button>
        </div>
      </div>

      {entries.length === 0 && <p className="text-xs text-[var(--color-ink-faint)]">No savings tracked yet.</p>}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <SavingsEntryCard key={entry.id} entry={entry} onUpdate={(patch) => updateEntry(entry.id, patch)} onRemove={() => removeEntry(entry.id)} />
        ))}
      </div>
    </div>
  )
}

function SavingsEntryCard({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: SavingsEntry
  onUpdate: (patch: Partial<SavingsEntry>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(!entry.name)
  const monthly = monthlyAmountForEntry(entry)

  const percent = entry.type === 'goal' && entry.targetAmount ? Math.min(100, ((entry.currentAmount ?? 0) / entry.targetAmount) * 100) : 0

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-elevated)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ink-faint)' }}>
          {entry.type === 'goal' ? 'Goal' : 'Monthly plan'}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(!editing)} className="text-xs font-medium" style={{ color: 'var(--color-coral)' }}>
            {editing ? 'Done' : 'Edit'}
          </button>
          <button onClick={onRemove} className="text-[var(--color-ink-faint)]">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              value={entry.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder={entry.type === 'goal' ? 'e.g. House deposit' : 'e.g. General savings'}
              className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
            />
          </Field>

          {entry.type === 'goal' ? (
            <>
              <Field label="Target date (optional)">
                <input
                  type="date"
                  value={entry.targetDate ?? ''}
                  onChange={(e) => onUpdate({ targetDate: e.target.value })}
                  className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
                />
              </Field>
              <Field label="Target amount (£)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={entry.targetAmount || ''}
                  onChange={(e) => onUpdate({ targetAmount: Number(e.target.value) })}
                  className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none font-mono"
                />
              </Field>
              <Field label="Saved so far (£)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={entry.currentAmount || ''}
                  onChange={(e) => onUpdate({ currentAmount: Number(e.target.value) })}
                  className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none font-mono"
                />
              </Field>
            </>
          ) : (
            <Field label="Amount per month (£)">
              <input
                type="number"
                inputMode="decimal"
                value={entry.monthlyAmount || ''}
                onChange={(e) => onUpdate({ monthlyAmount: Number(e.target.value) })}
                className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none font-mono"
              />
            </Field>
          )}

          <label className="flex items-center gap-2 col-span-2 mt-1">
            <input type="checkbox" checked={entry.includeInSummary} onChange={(e) => onUpdate({ includeInSummary: e.target.checked })} />
            <span className="text-xs text-[var(--color-ink-muted)]">Include in available balance</span>
          </label>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-body text-sm text-[var(--color-ink)]">{entry.name || 'Unnamed'}</span>
            {entry.type === 'goal' ? (
              <span className="font-mono text-sm text-[var(--color-ink-muted)]">
                £{(entry.currentAmount ?? 0).toFixed(0)} / £{(entry.targetAmount ?? 0).toFixed(0)}
              </span>
            ) : (
              <span className="font-mono text-sm text-[var(--color-ink-muted)]">£{(entry.monthlyAmount ?? 0).toFixed(2)}/mo</span>
            )}
          </div>
          {entry.type === 'goal' && (
            <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--color-track)' }}>
              <div className="h-full rounded-full" style={{ width: `${percent}%`, background: 'var(--color-coral)' }} />
            </div>
          )}
          <p className="text-xs" style={{ color: entry.includeInSummary ? 'var(--color-positive)' : 'var(--color-ink-faint)' }}>
            {entry.includeInSummary
              ? monthly > 0
                ? `£${monthly.toFixed(2)}/month counted in your available balance`
                : 'Included, but no monthly amount yet'
              : 'Not counted in available balance'}
          </p>
        </>
      )}
    </div>
  )
}

function BackupSection({ data, onRestore }: { data: AppData; onRestore: (data: AppData) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  function handleFile(file: File) {
    setError(null)
    setRestored(false)
    file
      .text()
      .then((text) => {
        const restoredData = parseFullBackupJson(text)
        const proceed = window.confirm(
          `This will replace everything currently in the app (${data.people.length} ${data.people.length === 1 ? 'person' : 'people'}, ${data.bills.length} bills, ${data.loans.length} loans, ${data.scenarios.length} scenarios) with the contents of this backup. This can't be undone. Continue?`
        )
        if (!proceed) return
        onRestore(restoredData)
        setRestored(true)
      })
      .catch((err) => setError(err.message))
  }

  return (
    <div className="rounded-2xl p-4 mb-6 flex items-center justify-between" style={{ background: 'var(--color-surface)' }}>
      <div>
        <h2 className="font-body text-sm font-semibold text-[var(--color-ink)]">Backup</h2>
        <p className="text-xs text-[var(--color-ink-faint)] mt-0.5 max-w-[220px]">
          Everything lives in this browser's storage — save a copy somewhere safe in case it gets cleared.
        </p>
        {error && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-negative)' }}>
            {error}
          </p>
        )}
        {restored && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-positive)' }}>
            Restored.
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => downloadFullBackup(data)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-bg-elevated)' }}
          title="Download a full backup"
        >
          <Download size={16} className="text-[var(--color-ink)]" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-bg-elevated)' }}
          title="Restore from a backup file"
        >
          <Upload size={16} className="text-[var(--color-ink)]" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--color-ink-muted)]">{label}</span>
      {children}
    </label>
  )
}

function BreakdownRow({ label, value, emphasized, bold }: { label: string; value: number; emphasized?: boolean; bold?: boolean }) {
  const negative = value < 0
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={`font-body ${emphasized || bold ? 'text-sm font-semibold text-[var(--color-ink)]' : 'text-sm text-[var(--color-ink-muted)]'}`}
      >
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${emphasized ? 'text-base font-semibold' : bold ? 'text-sm font-semibold' : 'text-sm'}`}
        style={{ color: emphasized || bold ? 'var(--color-ink)' : negative ? 'var(--color-negative)' : 'var(--color-ink)' }}
      >
        {negative ? '-' : ''}£{Math.abs(value).toFixed(2)}
      </span>
    </div>
  )
}
