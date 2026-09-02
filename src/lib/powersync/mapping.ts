import type { PersonRow, SalaryDeductionRow, SavingsEntryRow, BillRow, LoanRow, ScenarioRow } from './schema'
import type { Person, Bill, Loan, Scenario, SavingsEntry, BillLocation } from '../../types/models'
import type { SalaryDeduction, PayFrequency, StudentLoanPlan, DeductionType, DeductionAmountType, PercentBasis } from '../tax'

// PowerSync's synced columns are nullable by nature (the underlying sync
// protocol is schemaless — the schema is a view applied on top), even
// where the Postgres column itself is NOT NULL. Every read here falls
// back to a sane default rather than letting `null` leak into the app's
// own types, which don't expect it.

export function deductionFromRow(row: SalaryDeductionRow): SalaryDeduction {
  return {
    id: row.id,
    name: row.name ?? '',
    type: (row.type as DeductionType) ?? 'relief_at_source',
    amountType: (row.amount_type as DeductionAmountType) ?? 'fixed',
    amount: row.amount ?? 0,
    percentBasis: (row.percent_basis as PercentBasis | null) ?? undefined,
  }
}

export function savingsEntryFromRow(row: SavingsEntryRow): SavingsEntry {
  return {
    id: row.id,
    type: (row.type as 'goal' | 'plan') ?? 'plan',
    name: row.name ?? '',
    includeInSummary: row.include_in_summary !== 0, // default true, matching the column's own DB default
    targetAmount: row.target_amount ?? undefined,
    currentAmount: row.current_amount ?? undefined,
    targetDate: row.target_date ?? undefined,
    monthlyAmount: row.monthly_amount ?? undefined,
  }
}

export function personFromRows(row: PersonRow, deductionRows: SalaryDeductionRow[], savingsRows: SavingsEntryRow[]): Person {
  return {
    id: row.id,
    name: row.name ?? '',
    color: row.color ?? '#7c6fe0',
    linkedUserId: row.linked_user_id ?? undefined,
    salary: {
      grossAnnual: row.gross_annual ?? 0,
      taxCode: row.tax_code ?? '1257L',
      studentLoanPlan: (row.student_loan_plan as StudentLoanPlan) ?? 'none',
      payFrequency: (row.pay_frequency as PayFrequency) ?? 'monthly',
      deductions: deductionRows.filter((d) => d.person_id === row.id).map(deductionFromRow),
      employerPensionPercent: row.employer_pension_percent ?? undefined,
    },
    savingsEntries: savingsRows.filter((s) => s.person_id === row.id).map(savingsEntryFromRow),
  }
}

export function billFromRow(row: BillRow): Bill {
  return {
    id: row.id,
    name: row.name ?? '',
    cost: row.cost ?? 0,
    dueDay: row.due_day ?? 1,
    location: (row.location as BillLocation) ?? 'personal',
    payee: row.payee ?? '',
    payeeSharePercent: row.payee_share_percent ?? 50,
    category: row.category ?? '',
    ownerId: row.owner_id ?? '',
    isStandingOrder: row.is_standing_order !== 0,
    icon: row.icon ?? undefined,
    iconColor: row.icon_color ?? undefined,
  }
}

export function loanFromRow(row: LoanRow): Loan {
  return {
    id: row.id,
    name: row.name ?? '',
    firstPaymentDate: row.first_payment_date ?? '',
    totalAmount: row.total_amount ?? 0,
    monthlyPayment: row.monthly_payment ?? 0,
    icon: row.icon ?? undefined,
    iconColor: row.icon_color ?? undefined,
    location: (row.location as BillLocation) ?? 'personal',
    ownerId: row.owner_id ?? '',
    payee: row.payee ?? '',
    payeeSharePercent: row.payee_share_percent ?? 50,
  }
}

/**
 * `payload` is the jsonb catch-all column from the scenarios table
 * (20260831120003's own deliberate design — the real shape was unknown
 * at migration time, still genuinely open-ended given Scenario.actions'
 * many action-type-specific optional fields). `name` is stored in its
 * own column too (for queryability) as well as duplicated inside
 * payload's JSON on write — scenarioFromRow prefers the column.
 */
export function scenarioFromRow(row: ScenarioRow): Scenario {
  const payload = row.payload ? JSON.parse(row.payload) : {}
  return {
    id: row.id,
    name: row.name ?? payload.name ?? '',
    description: payload.description,
    includeInCumulative: payload.includeInCumulative ?? true,
    actions: payload.actions ?? [],
  }
}

export function scenarioToPayload(scenario: Omit<Scenario, 'id'>): string {
  return JSON.stringify({
    description: scenario.description,
    includeInCumulative: scenario.includeInCumulative,
    actions: scenario.actions,
  })
}
