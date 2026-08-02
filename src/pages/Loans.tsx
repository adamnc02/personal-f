import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppContext'
import { summarizeLoan, currentLoanMonthlyCost } from '../lib/loans'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Loan, BillLocation } from '../types/models'
import { SplitEditor } from '../components/SplitEditor'
import { EditField } from '../components/EditField'
import { BillIcon } from '../components/BillIcon'
import { BillIconPicker } from '../components/BillIconPicker'

export function Loans() {
  const { data, addLoan, updateLoan, removeLoan } = useAppData()
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const prefill = (routerLocation.state as { loanPrefill?: Partial<Omit<Loan, 'id'>> } | null)?.loanPrefill

  useEffect(() => {
    if (prefill) setAdding(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state])

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">Loans</h1>
        <button
          onClick={() => setAdding(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-surface)' }}
        >
          <Plus size={18} className="text-[var(--color-ink)]" />
        </button>
      </header>

      <p className="text-xs text-[var(--color-ink-faint)] mb-4 leading-relaxed">
        Loans act like automatic bills — their current monthly payment counts toward your personal or joint totals
        on the dashboard without you needing to add it separately.
      </p>

      {adding && (
        <NewLoanForm
          people={data.people}
          initial={prefill}
          onCancel={() => {
            setAdding(false)
            if (prefill) navigate('.', { replace: true, state: null })
          }}
          onSave={(loan) => {
            addLoan(loan)
            setAdding(false)
            if (prefill) navigate('.', { replace: true, state: null })
          }}
        />
      )}

      <div className="flex flex-col gap-4">
        {data.loans.map((loan) => {
          const summary = summarizeLoan(loan)
          const monthlyCost = currentLoanMonthlyCost(loan)
          const isOpen = expanded === loan.id
          return (
            <div key={loan.id} className="rounded-2xl p-5" style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BillIcon bill={loan} />
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">{loan.name}</h2>
                    <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                      £{summary.remaining.toFixed(2)} remaining · {summary.monthsRemaining} payment{summary.monthsRemaining === 1 ? '' : 's'} left
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: monthlyCost > 0 ? 'var(--color-ink-muted)' : 'var(--color-positive)' }}>
                      {monthlyCost > 0 ? `£${monthlyCost.toFixed(2)}/month` : 'Paid off'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => removeLoan(loan.id)} className="text-[var(--color-ink-faint)]">
                    <Trash2 size={16} />
                  </button>
                  <button onClick={() => setExpanded(isOpen ? null : loan.id)} className="text-[var(--color-ink-muted)]">
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
              </div>

              <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--color-track)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${summary.percentRepaid}%`, background: 'var(--color-coral)' }}
                />
              </div>

              {isOpen && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <EditField
                    label="Total amount (£)"
                    type="number"
                    value={loan.totalAmount}
                    onChange={(v) => updateLoan(loan.id, { totalAmount: Number(v) })}
                  />
                  <EditField
                    label="Monthly payment (£)"
                    type="number"
                    value={loan.monthlyPayment}
                    onChange={(v) => updateLoan(loan.id, { monthlyPayment: Number(v) })}
                  />
                  <EditField
                    label="First payment date"
                    type="date"
                    value={loan.firstPaymentDate}
                    onChange={(v) => updateLoan(loan.id, { firstPaymentDate: v })}
                  />
                  <EditField label="Name" type="text" value={loan.name} onChange={(v) => updateLoan(loan.id, { name: v })} />

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--color-ink-muted)]">Location</span>
                    <select
                      value={loan.location}
                      onChange={(e) => {
                        const location = e.target.value as BillLocation
                        updateLoan(loan.id, location === 'joint' ? { location, payee: loan.payee || data.people[0]?.id || '' } : { location })
                      }}
                      className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
                    >
                      <option value="personal">Personal</option>
                      <option value="joint">Joint</option>
                    </select>
                  </label>
                  {loan.location === 'personal' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-ink-muted)]">Owner</span>
                      <select
                        value={loan.ownerId}
                        onChange={(e) => updateLoan(loan.id, { ownerId: e.target.value })}
                        className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
                      >
                        {data.people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {loan.location === 'joint' && (
                    <SplitEditor
                      people={data.people}
                      payee={loan.payee || data.people[0]?.id || ''}
                      percent={loan.payeeSharePercent ?? 50}
                      onChangePayee={(payee) => updateLoan(loan.id, { payee })}
                      onChangePercent={(payeeSharePercent) => updateLoan(loan.id, { payeeSharePercent })}
                    />
                  )}

                  {summary.nextPayment && (
                    <p className="col-span-2 text-xs text-[var(--color-ink-muted)] mt-1">
                      Next payment: £{summary.nextPayment.amount.toFixed(2)} on {summary.nextPayment.date}
                    </p>
                  )}
                  {summary.finalPaymentDate && (
                    <p className="col-span-2 text-xs text-[var(--color-ink-muted)]">Final payment: {summary.finalPaymentDate}</p>
                  )}

                  <BillIconPicker
                    icon={loan.icon}
                    iconColor={loan.iconColor}
                    onChange={(patch) => updateLoan(loan.id, patch)}
                  />
                </div>
              )}
            </div>
          )
        })}

        {data.loans.length === 0 && !adding && (
          <p className="text-sm text-[var(--color-ink-muted)] text-center py-10">No loans yet. Add one to get started.</p>
        )}
      </div>
    </div>
  )
}

function NewLoanForm({
  people,
  initial,
  onSave,
  onCancel,
}: {
  people: { id: string; name: string }[]
  initial?: Partial<Omit<Loan, 'id'>>
  onSave: (loan: Omit<Loan, 'id'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount ? String(initial.totalAmount) : '')
  const [monthlyPayment, setMonthlyPayment] = useState(initial?.monthlyPayment ? String(initial.monthlyPayment) : '')
  const [firstPaymentDate, setFirstPaymentDate] = useState(initial?.firstPaymentDate ?? '')
  const [location, setLocation] = useState<BillLocation>(initial?.location ?? 'personal')
  const [ownerId, setOwnerId] = useState(initial?.ownerId || people[0]?.id || '')
  const [payee, setPayee] = useState(initial?.payee || people[0]?.id || '')
  const [payeeSharePercent, setPayeeSharePercent] = useState(initial?.payeeSharePercent ?? 50)
  const [icon, setIcon] = useState(initial?.icon)
  const [iconColor, setIconColor] = useState(initial?.iconColor)

  return (
    <div className="rounded-2xl p-4 mb-6 flex flex-col gap-3" style={{ background: 'var(--color-surface)' }}>
      <EditField label="Name" type="text" value={name} onChange={setName} />
      <div className="grid grid-cols-2 gap-3">
        <EditField label="Total amount (£)" type="number" value={totalAmount} onChange={setTotalAmount} />
        <EditField label="Monthly payment (£)" type="number" value={monthlyPayment} onChange={setMonthlyPayment} />
      </div>
      <EditField label="First payment date" type="date" value={firstPaymentDate} onChange={setFirstPaymentDate} />

      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--color-ink-muted)]">Location</span>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value as BillLocation)}
          className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
        >
          <option value="personal">Personal</option>
          <option value="joint">Joint</option>
        </select>
      </label>
      {location === 'joint' ? (
        <SplitEditor people={people} payee={payee} percent={payeeSharePercent} onChangePayee={setPayee} onChangePercent={setPayeeSharePercent} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-ink-muted)]">Owner</span>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <BillIconPicker
        icon={icon}
        iconColor={iconColor}
        onChange={(patch) => {
          if ('icon' in patch) setIcon(patch.icon)
          if (patch.iconColor) setIconColor(patch.iconColor)
        }}
      />

      <div className="flex gap-2 justify-end mt-1">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-ink-muted)]">
          Cancel
        </button>
        <button
          onClick={() => {
            if (!name.trim() || !totalAmount || !monthlyPayment || !firstPaymentDate) return
            onSave({
              name: name.trim(),
              totalAmount: Number(totalAmount),
              monthlyPayment: Number(monthlyPayment),
              firstPaymentDate,
              location,
              ownerId: location === 'personal' ? ownerId : '',
              payee: location === 'joint' ? payee : '',
              payeeSharePercent: location === 'joint' ? payeeSharePercent : 100,
              icon,
              iconColor,
            })
          }}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-coral)', color: '#fff' }}
        >
          Add loan
        </button>
      </div>
    </div>
  )
}

