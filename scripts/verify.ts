import { calculateNetSalary } from '../src/lib/tax'
import { buildLoanSchedule, summarizeLoan, currentLoanMonthlyCost } from '../src/lib/loans'
import { costForPerson, jointContributionForPerson, personalBillsTotal } from '../src/lib/bills'
import { calculateScenarioImpact, mergeScenarios } from '../src/lib/scenarios'
import { calculateFinanceAgreement } from '../src/lib/finance'
import { mergeImportedBills } from '../src/lib/storage'
import type { AppData, Bill, Loan, Person, Scenario } from '../src/types/models'

let failures = 0
function check(label: string, actual: unknown, expected: unknown, tolerance = 0.01) {
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) <= tolerance
      : JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? '✓' : '✗ FAIL'} ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

// ---- 1. Pay frequency: Ella-style 4-weekly should divide by 13, not 12 ----
const ellaSalary = {
  grossAnnual: 32000,
  taxCode: '1257L',
  pensionType: 'relief_at_source' as const,
  pensionPercent: 5,
  studentLoanPlan: 'plan2' as const,
  payFrequency: 'four_weekly' as const,
}
const ellaBreakdown = calculateNetSalary(ellaSalary)
check('Ella periodsPerYear', ellaBreakdown.periodsPerYear, 13)
check('Ella netPerPeriod = netAnnual / 13', ellaBreakdown.netPerPeriod, ellaBreakdown.netAnnual / 13)
check('Ella netMonthly still = netAnnual / 12 (unaffected reference figure)', ellaBreakdown.netMonthly, ellaBreakdown.netAnnual / 12)

const adamSalary = { ...ellaSalary, payFrequency: 'monthly' as const, studentLoanPlan: 'none' as const }
const adamBreakdown = calculateNetSalary(adamSalary)
check('Adam (monthly) netPerPeriod === netMonthly (no regression)', adamBreakdown.netPerPeriod, adamBreakdown.netMonthly)

// ---- 2. Loan schedule + currentLoanMonthlyCost near payoff ----
const loan: Loan = {
  id: 'loan1',
  name: 'Car',
  firstPaymentDate: '2020-01-01',
  totalAmount: 1000,
  monthlyPayment: 300,
  location: 'personal',
  ownerId: 'adam',
  payee: '',
  payeeSharePercent: 100,
}
const schedule = buildLoanSchedule(loan)
check('Loan schedule length (1000/300 -> 4 payments)', schedule.length, 4)
check('Final payment absorbs rounding (1000 - 3*300 = 100)', schedule[3].amount, 100)
check('Balance hits exactly 0', schedule[3].balanceAfter, 0)

const asOfNearEnd = new Date('2020-03-15') // after 3 payments (Jan/Feb/Mar), before the 4th (Apr 1)
const summary = summarizeLoan(loan, asOfNearEnd)
check('summarizeLoan remaining after 3 payments', summary.remaining, 100)
check('currentLoanMonthlyCost uses reduced final payment, not flat monthlyPayment', currentLoanMonthlyCost(loan, asOfNearEnd), 100)

const asOfPaidOff = new Date('2021-01-01')
check('currentLoanMonthlyCost is 0 once fully paid off', currentLoanMonthlyCost(loan, asOfPaidOff), 0)

// ---- 3. Bill split percentages, both directions ----
const people: Person[] = [
  { id: 'adam', name: 'Adam', color: '#fff', salary: adamSalary, savingsEntries: [] },
  { id: 'ella', name: 'Ella', color: '#fff', salary: ellaSalary, savingsEntries: [] },
]
const splitBill: Bill = {
  id: 'b1',
  name: 'Netflix',
  cost: 100,
  dueDay: 1,
  location: 'joint',
  payee: 'adam',
  payeeSharePercent: 60,
  category: 'TV',
  ownerId: '',
  isStandingOrder: true,
}
check('costForPerson: payee gets their %', costForPerson(splitBill, 'adam', people), 60)
check('costForPerson: remainder goes to the other person', costForPerson(splitBill, 'ella', people), 40)
check('costForPerson: uninvolved third person gets nothing', costForPerson(splitBill, 'nobody', people), 0)

const fullBill: Bill = { ...splitBill, id: 'b2', payeeSharePercent: 100 }
check('100% split: payee pays it all', costForPerson(fullBill, 'adam', people), 100)
check('100% split: other person pays nothing', costForPerson(fullBill, 'ella', people), 0)

const bills = [splitBill]
check('jointContributionForPerson matches costForPerson sum', jointContributionForPerson(bills, 'adam', people), 60)
check('personalBillsTotal ignores joint bills', personalBillsTotal(bills, 'adam'), 0)

// ---- 4. Scenario: sell asset covering loan + overflow as one-off cash ----
const bigLoan: Loan = { ...loan, id: 'loan2', totalAmount: 6080, monthlyPayment: 411, firstPaymentDate: '2024-01-01' }
const scenarioData: AppData = {
  people,
  bills: [],
  loans: [bigLoan],
  scenarios: [],
  primaryPersonId: 'adam',
}
const sellScenario: Scenario = {
  id: 's1',
  name: 'Sell truck',
  includeInCumulative: true,
  actions: [{ id: 'a1', type: 'sell_asset', label: '', value: 10000, linkedLoanId: 'loan2' }],
}
const impact = calculateScenarioImpact(sellScenario, scenarioData, 'adam', 1000)
const remaining = summarizeLoan(bigLoan).remaining
check('Overflow beyond loan remaining becomes one-off cash (not swallowed)', impact.oneOffCashImpact, 10000 - remaining)
check('Loan impact shows fully paid off', impact.loanImpacts[0]?.fullyPaidOff, true)

// ---- 5. Cumulative merge: two scenarios targeting the same loan combine correctly ----
const loanForMerge: Loan = { ...loan, id: 'loan3', totalAmount: 1000, monthlyPayment: 100, firstPaymentDate: '2027-01-01' }
const mergeData: AppData = { ...scenarioData, loans: [loanForMerge] }
const s1: Scenario = { id: 's1', name: 'A', includeInCumulative: true, actions: [{ id: 'a1', type: 'pay_off_loan', label: '', value: 400, linkedLoanId: 'loan3' }] }
const s2: Scenario = { id: 's2', name: 'B', includeInCumulative: true, actions: [{ id: 'a2', type: 'pay_off_loan', label: '', value: 400, linkedLoanId: 'loan3' }] }
const merged = mergeScenarios([s1, s2])
const mergedImpact = calculateScenarioImpact(merged, mergeData, 'adam', 1000)
check('Merged lump sums combine (400+400=800) against real remaining, not double-counted incorrectly', mergedImpact.loanImpacts[0]?.newRemaining, 1000 - 800)

// ---- 6. change_bill honours location/split instead of always being the viewer's ----
const changeBillScenario: Scenario = {
  id: 's3',
  name: 'Finance',
  includeInCumulative: true,
  actions: [
    {
      id: 'a3',
      type: 'new_bill',
      label: '',
      value: 150,
      name: 'Furniture finance',
      location: 'joint',
      payee: 'adam',
      payeeSharePercent: 70,
    },
  ],
}
const changeBillData: AppData = { ...scenarioData, loans: [] }
const cbImpactAdam = calculateScenarioImpact(changeBillScenario, changeBillData, 'adam', 1000)
const cbImpactElla = calculateScenarioImpact(changeBillScenario, changeBillData, 'ella', 1000)
check('new_bill: Adam (70%) sees -105/mo', cbImpactAdam.monthlyImpact, -105)
check('new_bill: Ella (30%) sees -45/mo', cbImpactElla.monthlyImpact, -45)

// ---- 7. Finance agreement: amortisation math ----
const zeroApr = calculateFinanceAgreement({ borrowAmount: 1000, aprPercent: 0, termMonths: 10 })
check('0% APR: monthly payment is a flat split', zeroApr.monthlyPayment, 100)
check('0% APR: total repayable = borrowed amount', zeroApr.totalRepayable, 1000)
check('0% APR: no interest', zeroApr.totalInterest, 0)

const withApr = calculateFinanceAgreement({ borrowAmount: 1000, aprPercent: 12, termMonths: 12 })
check('12% APR over 12mo: monthly payment ≈ £88.85 (standard amortisation)', withApr.monthlyPayment, 88.85, 0.1)
check('12% APR: total repayable > borrowed amount (interest applied)', withApr.totalRepayable > 1000, true)
check('12% APR: totalRepayable = monthlyPayment × term', withApr.totalRepayable, withApr.monthlyPayment * 12, 0.05)

// ---- 8. Bill import: wipes+replaces joint bills, preserves personal bills, handles deletions ----
const existingBills: Bill[] = [
  { id: 'p1', name: 'Gym', cost: 30, dueDay: 1, location: 'personal', ownerId: 'adam', payee: '', payeeSharePercent: 100, category: 'Health', isStandingOrder: true },
  { id: 'j1', name: 'Netflix', cost: 15, dueDay: 1, location: 'joint', ownerId: '', payee: 'adam', payeeSharePercent: 50, category: 'TV', isStandingOrder: true },
  { id: 'j2', name: 'Old bill no longer in export', cost: 5, dueDay: 1, location: 'joint', ownerId: '', payee: 'adam', payeeSharePercent: 50, category: 'X', isStandingOrder: true },
]
const importedJointOnly: Bill[] = [
  { id: 'new1', name: 'Netflix', cost: 20, dueDay: 1, location: 'joint', ownerId: '', payee: 'ella', payeeSharePercent: 50, category: 'TV', isStandingOrder: true },
  { id: 'new2', name: 'Spotify', cost: 10, dueDay: 5, location: 'joint', ownerId: '', payee: 'adam', payeeSharePercent: 50, category: 'TV', isStandingOrder: true },
]
const mergedBills = mergeImportedBills(existingBills, importedJointOnly)
check('Merge: personal bill preserved untouched', mergedBills.some((b) => b.id === 'p1'), true)
check('Merge: old joint bill not in import is gone (deletion handled)', mergedBills.some((b) => b.id === 'j2'), false)
check('Merge: new joint bills from import present', mergedBills.filter((b) => b.location === 'joint').length, 2)
check('Merge: total count = 1 personal + 2 new joint', mergedBills.length, 3)

// ---- 9. Savings lump sum: reduces remaining and shows months saved ----
const adamWithGoal: Person = {
  ...people[0],
  savingsEntries: [
    { id: 'goal1', type: 'goal', name: 'House deposit', includeInSummary: false, targetAmount: 5000, currentAmount: 1000, targetDate: '2027-08-01' },
  ],
}
const savingsData: AppData = { ...scenarioData, people: [adamWithGoal, people[1]], loans: [] }
const savingsScenario: Scenario = {
  id: 's4',
  name: 'Lump sum to house deposit',
  includeInCumulative: true,
  actions: [{ id: 'a4', type: 'savings_lump_sum', label: '', value: 2000, personId: 'adam', savingsEntryId: 'goal1' }],
}
const savingsImpact = calculateScenarioImpact(savingsScenario, savingsData, 'adam', 1000)
check('Savings lump sum reduces oneOffCashImpact (money spent into savings)', savingsImpact.oneOffCashImpact, -2000)
check('Savings lump sum: newRemaining = 4000 - 2000', savingsImpact.savingsImpacts[0]?.newRemaining, 2000)
check('Savings lump sum: months saved > 0 with a target date', savingsImpact.savingsImpacts[0]?.monthsSaved > 0, true)

// ---- 10. Cascade fix: reproduces the exact reported bug ----
// Sell for £15,000 across two loans (Monzo needs £7696.19, Car needs
// £7453.78 — combined £15,149.97, MORE than the sale). Old behaviour
// double-counted: showed +£7303.81 "leftover" that was also being spent on
// the second loan. Correct behaviour: Car can't be fully cleared, and there
// is truly nothing left over.
const monzoLoan: Loan = { ...loan, id: 'monzo', totalAmount: 7696.19, monthlyPayment: 7696.19, firstPaymentDate: '2027-01-01' }
const carLoan: Loan = { ...loan, id: 'car', totalAmount: 7453.78, monthlyPayment: 7453.78, firstPaymentDate: '2027-01-01' }
const cascadeData: AppData = { ...scenarioData, loans: [monzoLoan, carLoan] }
const cascadeScenario: Scenario = {
  id: 'cascade',
  name: 'Sell car',
  includeInCumulative: true,
  actions: [{ id: 'ca1', type: 'sell_asset', label: '', value: 15000, linkedLoanIds: ['monzo', 'car'] }],
}
const cascadeImpact = calculateScenarioImpact(cascadeScenario, cascadeData, 'adam', 1000)
check('Cascade: Monzo (first target) fully paid off', cascadeImpact.loanImpacts.find((l) => l.loanId === 'monzo')?.fullyPaidOff, true)
check('Cascade: Car (second target) NOT fully paid off — not enough money left', cascadeImpact.loanImpacts.find((l) => l.loanId === 'car')?.fullyPaidOff, false)
check(
  "Cascade: Car's remaining after = 7453.78 - (15000-7696.19) = 149.97",
  cascadeImpact.loanImpacts.find((l) => l.loanId === 'car')?.newRemaining,
  149.97
)
check('Cascade: NO leftover one-off cash — every pound was spoken for', cascadeImpact.oneOffCashImpact, 0)

// ---- 11. Manual per-target amount override ----
// £15,000 sale, explicitly send only £5,000 to Monzo (not its full £7696.19
// need) and let Car auto-take the rest.
const overrideScenario: Scenario = {
  id: 'override',
  name: 'Sell car, manual split',
  includeInCumulative: true,
  actions: [
    {
      id: 'ov1',
      type: 'sell_asset',
      label: '',
      value: 15000,
      loanAllocations: [
        { loanId: 'monzo', amount: 5000 },
        { loanId: 'car' }, // auto — takes whatever's left
      ],
    },
  ],
}
const overrideImpact = calculateScenarioImpact(overrideScenario, cascadeData, 'adam', 1000)
check('Manual override: Monzo gets exactly the specified £5000, not its full need', overrideImpact.loanImpacts.find((l) => l.loanId === 'monzo')?.lumpSumApplied, 5000)
check('Manual override: Car auto-takes the remaining £10000 pool (capped to its own £7453.78 need)', overrideImpact.loanImpacts.find((l) => l.loanId === 'car')?.lumpSumApplied, 7453.78)
check('Manual override: Car fully paid off since 10000 pool exceeds its need', overrideImpact.loanImpacts.find((l) => l.loanId === 'car')?.fullyPaidOff, true)
check('Manual override: leftover cash = 15000 - 5000 - 7453.78', overrideImpact.oneOffCashImpact, 15000 - 5000 - 7453.78)

// ---- Summary ----
console.log('\n' + (failures === 0 ? `All checks passed.` : `${failures} check(s) FAILED.`))
process.exit(failures === 0 ? 0 : 1)
