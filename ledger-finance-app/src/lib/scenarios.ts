import type { AppData, Bill, Loan, Scenario } from '../types/models'
import { summarizeLoan, currentLoanMonthlyCost } from './loans'
import { costForPerson } from './bills'
import { calculateNetSalary } from './tax'

export interface LoanImpact {
  loanId: string
  loanName: string
  kind: 'payoff' | 'exclude' | 'overpayment'
  originalRemaining: number
  newRemaining: number
  lumpSumApplied: number // 'payoff' only
  overpaymentPerMonth: number // 'overpayment' only
  originalMonthsRemaining: number
  newMonthsRemaining: number
  monthsSaved: number
  fullyPaidOff: boolean
  originalMonthlyCostForPerson: number
  newMonthlyCostForPerson: number
}

export interface SalaryChangeImpact {
  personId: string
  personName: string
  oldNetMonthly: number // actually "per pay period" — named for backward compat, see calculateNetSalary's netPerPeriod
  newNetMonthly: number
  delta: number
}

export interface ScenarioImpact {
  oneOffCashImpact: number // one-time proceeds/costs, including any lump sum beyond what a loan needed
  monthlyAvailableBefore: number
  monthlyAvailableAfter: number
  monthlyImpact: number // recurring monthly change, from loans, new/cancelled costs, or a salary change
  loanImpacts: LoanImpact[]
  salaryChangeImpact: SalaryChangeImpact | null
}

/**
 * Calculates the effect of a scenario on a specific person's finances.
 * Handles three shapes of change:
 *  - One-off: a single point-in-time cash gain or cost
 *  - Recurring: an ongoing monthly change (new cost, cancelled cost, salary change)
 *  - Loan-specific: paying off (fully/partially), excluding, or overpaying a loan
 */
export function calculateScenarioImpact(scenario: Scenario, data: AppData, personId: string, monthlyAvailableBefore: number): ScenarioImpact {
  let oneOffCashImpact = 0
  let monthlyImpact = 0
  const loanImpacts: LoanImpact[] = []
  let salaryChangeImpact: SalaryChangeImpact | null = null

  const loanLumpSums = new Map<string, number>()
  const loanExclusions = new Set<string>()
  const loanOverpayments = new Map<string, number>()

  for (const action of scenario.actions) {
    if (action.type === 'sell_asset') {
      if (action.linkedLoanId) {
        loanLumpSums.set(action.linkedLoanId, (loanLumpSums.get(action.linkedLoanId) ?? 0) + action.value)
      } else {
        oneOffCashImpact += action.value
      }
    } else if (action.type === 'buy_asset') {
      oneOffCashImpact -= action.value
    } else if (action.type === 'pay_off_loan' && action.linkedLoanId) {
      loanLumpSums.set(action.linkedLoanId, (loanLumpSums.get(action.linkedLoanId) ?? 0) + action.value)
    } else if (action.type === 'new_bill' || action.type === 'new_finance_agreement') {
      // Both are ongoing monthly costs — a simple new bill, or a finance
      // agreement's computed monthly payment. Not one-off, and only counts
      // toward this person's available cash based on its location/split,
      // same as a real bill would.
      const virtualBill: Bill = {
        id: `action:${action.id}`,
        name: action.name || (action.type === 'new_finance_agreement' ? 'New finance agreement' : 'New bill'),
        cost: action.value,
        dueDay: 1,
        location: action.location ?? 'personal',
        ownerId: action.ownerId ?? personId,
        payee: action.payee ?? personId,
        payeeSharePercent: action.payeeSharePercent ?? 100,
        category: 'Scenario',
        isStandingOrder: true,
      }
      monthlyImpact -= costForPerson(virtualBill, personId, data.people)
    } else if (action.type === 'exclude_loan' && action.linkedLoanId) {
      loanExclusions.add(action.linkedLoanId)
    } else if (action.type === 'loan_overpayment' && action.linkedLoanId) {
      loanOverpayments.set(action.linkedLoanId, (loanOverpayments.get(action.linkedLoanId) ?? 0) + action.value)
    } else if (action.type === 'salary_change') {
      const targetPersonId = action.personId || personId
      const person = data.people.find((p) => p.id === targetPersonId)
      if (person) {
        const oldNetPerPeriod = calculateNetSalary(person.salary).netPerPeriod
        const newNetPerPeriod = calculateNetSalary({ ...person.salary, grossAnnual: action.value }).netPerPeriod
        const delta = newNetPerPeriod - oldNetPerPeriod
        salaryChangeImpact = { personId: targetPersonId, personName: person.name, oldNetMonthly: oldNetPerPeriod, newNetMonthly: newNetPerPeriod, delta }
        // Only affects the available-cash total for the person actually viewing this scenario
        if (targetPersonId === personId) monthlyImpact += delta
      }
    }
  }

  // --- Lump sum payoffs ---
  for (const [loanId, requestedLumpSum] of loanLumpSums.entries()) {
    const loan = data.loans.find((l) => l.id === loanId)
    if (!loan) continue

    const original = summarizeLoan(loan)
    // Only as much as the loan actually needs goes toward it — any extra is
    // real cash left in your pocket, not swallowed by an overpayment.
    const lumpSum = Math.min(requestedLumpSum, original.remaining)
    oneOffCashImpact += requestedLumpSum - lumpSum

    const newRemaining = round2(Math.max(0, original.remaining - lumpSum))
    const fullyPaidOff = newRemaining <= 0

    // If not fully cleared, spread the reduced balance over the same
    // remaining term — a genuinely reduced monthly payment, not a shorter one.
    const newMonthlyPayment = fullyPaidOff
      ? 0
      : original.monthsRemaining > 0
        ? round2(newRemaining / original.monthsRemaining)
        : loan.monthlyPayment

    const originalMonthlyCostForPerson = costForPerson(virtualLoanBill(loan, currentLoanMonthlyCost(loan)), personId, data.people)
    const newMonthlyCostForPerson = costForPerson(virtualLoanBill(loan, newMonthlyPayment), personId, data.people)
    monthlyImpact += originalMonthlyCostForPerson - newMonthlyCostForPerson

    loanImpacts.push({
      loanId,
      loanName: loan.name,
      kind: 'payoff',
      originalRemaining: original.remaining,
      newRemaining,
      lumpSumApplied: lumpSum,
      overpaymentPerMonth: 0,
      originalMonthsRemaining: original.monthsRemaining,
      newMonthsRemaining: fullyPaidOff ? 0 : original.monthsRemaining,
      monthsSaved: fullyPaidOff ? original.monthsRemaining : 0,
      fullyPaidOff,
      originalMonthlyCostForPerson,
      newMonthlyCostForPerson,
    })
  }

  // --- Exclusions: "what if this loan just didn't count" ---
  for (const loanId of loanExclusions) {
    const loan = data.loans.find((l) => l.id === loanId)
    if (!loan) continue

    const original = summarizeLoan(loan)
    const originalMonthlyCostForPerson = costForPerson(virtualLoanBill(loan, currentLoanMonthlyCost(loan)), personId, data.people)
    monthlyImpact += originalMonthlyCostForPerson

    loanImpacts.push({
      loanId,
      loanName: loan.name,
      kind: 'exclude',
      originalRemaining: original.remaining,
      newRemaining: original.remaining, // unchanged — it's excluded from your budget, not paid off
      lumpSumApplied: 0,
      overpaymentPerMonth: 0,
      originalMonthsRemaining: original.monthsRemaining,
      newMonthsRemaining: original.monthsRemaining,
      monthsSaved: 0,
      fullyPaidOff: false,
      originalMonthlyCostForPerson,
      newMonthlyCostForPerson: 0,
    })
  }

  // --- Regular overpayments: an extra amount every month, shortening the term ---
  for (const [loanId, extraPerMonth] of loanOverpayments.entries()) {
    const loan = data.loans.find((l) => l.id === loanId)
    if (!loan || extraPerMonth <= 0) continue

    const original = summarizeLoan(loan)
    const newMonthlyPayment = loan.monthlyPayment + extraPerMonth
    const newMonthsRemaining = newMonthlyPayment > 0 ? Math.ceil(original.remaining / newMonthlyPayment) : original.monthsRemaining

    const originalMonthlyCostForPerson = costForPerson(virtualLoanBill(loan, currentLoanMonthlyCost(loan)), personId, data.people)
    const newMonthlyCostForPerson = costForPerson(virtualLoanBill(loan, Math.min(newMonthlyPayment, original.remaining)), personId, data.people)
    // Overpaying costs more per month now (a negative to available cash)
    monthlyImpact += originalMonthlyCostForPerson - newMonthlyCostForPerson

    loanImpacts.push({
      loanId,
      loanName: loan.name,
      kind: 'overpayment',
      originalRemaining: original.remaining,
      newRemaining: original.remaining, // principal isn't reduced instantly, just paid down faster over time
      lumpSumApplied: 0,
      overpaymentPerMonth: extraPerMonth,
      originalMonthsRemaining: original.monthsRemaining,
      newMonthsRemaining,
      monthsSaved: Math.max(0, original.monthsRemaining - newMonthsRemaining),
      fullyPaidOff: false,
      originalMonthlyCostForPerson,
      newMonthlyCostForPerson,
    })
  }

  return {
    oneOffCashImpact: round2(oneOffCashImpact),
    monthlyAvailableBefore,
    monthlyAvailableAfter: round2(monthlyAvailableBefore + monthlyImpact),
    monthlyImpact: round2(monthlyImpact),
    loanImpacts,
    salaryChangeImpact,
  }
}

/** A loan's monthly payment represented as a Bill, so it can reuse the same person-split logic. */
function virtualLoanBill(loan: Loan, cost: number): Bill {
  return {
    id: `loan:${loan.id}`,
    name: loan.name,
    cost,
    dueDay: 1,
    location: loan.location,
    payee: loan.payee,
    payeeSharePercent: loan.payeeSharePercent,
    category: 'Loan',
    ownerId: loan.ownerId,
    isStandingOrder: true,
  }
}

/**
 * Combines several scenarios into one, so their combined effect can be run
 * through calculateScenarioImpact in a single pass. This matters for
 * correctness, not just convenience: if two scenarios both target the same
 * loan, their lump sums/overpayments need to be summed together against
 * that loan's real remaining balance, not evaluated independently against
 * the same starting point twice.
 */
export function mergeScenarios(scenarios: Scenario[]): Scenario {
  return {
    id: 'combined',
    name: 'Combined',
    includeInCumulative: false,
    actions: scenarios.flatMap((s) => s.actions),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
