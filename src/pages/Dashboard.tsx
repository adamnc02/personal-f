import { useState } from 'react'
import { useAppData } from '../context/AppContext'
import { SwipeCards } from '../components/SwipeCards'
import { BankCard } from '../components/BankCard'
import { BillsTable } from '../components/BillsTable'
import { ProgressRing } from '../components/ProgressRing'
import { calculateNetSalary } from '../lib/tax'
import { billsByLocation, personalBillsTotal, jointContributionForPerson, standingOrderTotalForPerson, totalOutgoingsForPerson, jointAccountTotal } from '../lib/bills'
import { summarizeLoan, combineBillsWithLoans } from '../lib/loans'
import { totalMonthlySavingsForPerson } from '../lib/savings'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { Landmark } from 'lucide-react'
import type { Bill } from '../types/models'

export function Dashboard() {
  const { data } = useAppData()
  const [cardIndex, setCardIndex] = useState(0)

  const me = data.people.find((p) => p.id === data.primaryPersonId) ?? data.people[0]
  const otherPeople = data.people.filter((p) => p.id !== me?.id)

  if (!me) {
    return <EmptyState />
  }

  // Loans behave like automatic recurring bills — their current monthly
  // payment flows through the same totals as everything else, without
  // needing a separate duplicate bill entry.
  const allBills = combineBillsWithLoans(data.bills, data.loans)

  const netSalary = calculateNetSalary(me.salary)
  const personalBills = billsByLocation(allBills, 'personal', me.id).filter((b) => b.cost > 0)
  const jointBills = billsByLocation(allBills, 'joint').filter((b) => b.cost > 0)

  const personalTotal = personalBillsTotal(allBills, me.id)
  const jointContribution = jointContributionForPerson(allBills, me.id, data.people)
  const monthlySavings = totalMonthlySavingsForPerson(me)
  const availableAfterBills = netSalary.netPerPeriod - personalTotal - jointContribution - monthlySavings

  const standingOrderTotal = standingOrderTotalForPerson(allBills, me.id)
  const fullOutgoings = totalOutgoingsForPerson(allBills, me.id, data.people)
  const jointTotal = jointAccountTotal(allBills)

  // A synthetic row representing this person's total stake in the joint account,
  // shown alongside their personal bills so the table total matches their
  // real monthly outgoings (personal bills + joint share).
  const jointAccountRow: Bill = {
    id: '__joint_account_stake__',
    name: 'Joint Account',
    cost: jointContribution,
    dueDay: 0,
    location: 'personal',
    payee: me.id,
    payeeSharePercent: 100,
    category: 'Joint Account',
    ownerId: me.id,
    isStandingOrder: false,
  }
  const personalTableRows = jointContribution > 0 ? [...personalBills, jointAccountRow] : personalBills

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="mb-6">
        <p className="font-body text-sm text-[var(--color-ink-muted)]">Welcome back</p>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{me.name}'s Overview</h1>
      </header>

      <SwipeCards activeIndex={cardIndex} onChange={setCardIndex}>
        <BankCard variant="coral" bankLabel={me.name} accountLabel="Personal">
          <div className="mt-6 space-y-1.5">
            <CardRow label={me.salary.payFrequency === 'four_weekly' ? 'Net Pay (4wk)' : 'Net Salary'} value={netSalary.netPerPeriod} light />
            <CardRow label="Bills" value={personalTotal + jointContribution} light />
            {monthlySavings > 0 && <CardRow label="Savings" value={monthlySavings} light />}
            <CardRow label="Available" value={availableAfterBills} light emphasized />
          </div>
        </BankCard>

        <BankCard variant="light" bankLabel={me.name.toLowerCase()} accountLabel="joint">
          <div className="mt-6 space-y-1.5">
            <CardRow label="Bills" value={jointTotal} />
            {[me, ...otherPeople].map((p) => (
              <CardRow key={p.id} label={p.name} value={jointContributionForPerson(allBills, p.id, data.people)} />
            ))}
          </div>
        </BankCard>
      </SwipeCards>

      <CollapsibleSection title={cardIndex === 0 ? 'Bills' : 'Joint Bills'} className="mt-8">
        {cardIndex === 0 ? (
          <>
            <BillsTable bills={personalTableRows} people={data.people} total={fullOutgoings} />
            <div className="mt-6 rounded-2xl p-5" style={{ background: 'var(--color-surface)' }}>
              <SummaryRow label="Standing orders only" value={standingOrderTotal} />
              <SummaryRow label="Including joint bill split" value={fullOutgoings} emphasized />
            </div>
          </>
        ) : (
          <BillsTable bills={jointBills} people={data.people} showSplit total={jointTotal} />
        )}
      </CollapsibleSection>

      {data.loans.length > 0 && (
        <CollapsibleSection title="Loans" className="mt-10">
          <div className="flex flex-col items-center gap-10">
            {data.loans.map((loan) => {
              const summary = summarizeLoan(loan)
              return (
                <ProgressRing
                  key={loan.id}
                  percent={summary.percentRepaid}
                  value={`£${summary.remaining.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  label={`${loan.name} Remaining`}
                  icon={<Landmark size={56} strokeWidth={1.25} />}
                />
              )
            })}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

function CardRow({ label, value, light, emphasized }: { label: string; value: number; light?: boolean; emphasized?: boolean }) {
  const negative = value < 0
  return (
    <div className="flex items-baseline justify-between">
      <span
        className="font-body text-[13px] uppercase tracking-wider"
        style={{ color: light ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)', opacity: emphasized ? 1 : 0.9 }}
      >
        {label}
      </span>
      <span
        className={`font-display tabular-nums ${emphasized ? 'text-xl font-bold' : 'text-base font-semibold'}`}
        style={{ color: light ? '#fff' : '#1a1a1a' }}
      >
        {negative ? '-' : ''}£{Math.abs(value).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    </div>
  )
}

function SummaryRow({ label, value, emphasized }: { label: string; value: number; emphasized?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-body text-sm text-[var(--color-ink-muted)]">{label}</span>
      <span className={`font-mono tabular-nums ${emphasized ? 'text-lg font-semibold text-[var(--color-ink)]' : 'text-sm text-[var(--color-ink)]'}`}>
        £{value.toFixed(2)}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="font-display text-xl font-semibold text-[var(--color-ink)] mb-2">Let's get set up</h1>
      <p className="font-body text-sm text-[var(--color-ink-muted)]">
        Head to the Salary tab to add your details and start tracking.
      </p>
    </div>
  )
}
