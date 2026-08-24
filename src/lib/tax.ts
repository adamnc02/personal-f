// UK tax engine — rates confirmed for the 2026/27 tax year (6 Apr 2026 – 5 Apr 2027).
// Sources: HMRC "Rates and thresholds for employers 2026 to 2027", House of Commons
// Library "Direct taxes: Rates and allowances for 2026/27".
//
// This calculates PER PAY PERIOD using HMRC's published per-period thresholds and
// rounding rules, rather than working annually and dividing. That matters because
// HMRC's per-period thresholds are NOT the annual figure divided by the number of
// periods — e.g. the monthly NI primary threshold is £1,048, which is £12,576/yr,
// not £12,570. Getting this wrong costs a few pence on every payslip.
//
// This is a non-cumulative ("Month 1" / "Week 1") calculation. It matches a single
// payslip for someone on level pay to the penny, which is what this app is for.
// Real cumulative PAYE reconciles rounding across the year, so `netAnnual` here
// (= netPerPeriod × periods) can differ from a true year-end figure by a pound or
// two. It also doesn't model multiple jobs, benefits in kind, marriage allowance,
// mid-year pay changes, Scottish rate bands, the K-code 50% regulatory limit, or
// higher-rate pension relief reclaimed via self-assessment.

export type StudentLoanPlan = 'none' | 'plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgrad'
export type PayFrequency = 'monthly' | 'four_weekly'

// How a deduction affects the calculation, matching real payroll categories:
//  - salary_sacrifice: comes off gross before BOTH tax and NI are calculated
//    (a genuine reduction in contractual pay, e.g. pension via sacrifice,
//    Cycle to Work, a Holiday Purchase Scheme)
//  - net_pay: comes off gross before tax only — NI and student loan are still
//    charged on the full gross (a "net pay arrangement" pension)
//  - relief_at_source: comes off net pay, after tax/NI/student loan are
//    calculated on the full gross (a relief-at-source pension; the pension
//    provider claims basic-rate relief separately, not modelled here)
//  - post_tax: comes off net pay, no effect on any calculation at all (e.g.
//    a workplace lottery, a charity deduction, a season ticket loan repayment)
export type DeductionType = 'salary_sacrifice' | 'net_pay' | 'relief_at_source' | 'post_tax'
export type DeductionAmountType = 'fixed' | 'percent'

// What a percentage deduction is a percentage OF:
//  - 'gross' (default): the full gross for the period
//  - 'qualifying_earnings': the auto-enrolment band only, i.e. the slice of pay
//    between the lower and upper qualifying earnings limits (£520–£4,189/month
//    for 2026/27). This is the statutory minimum basis most workplace pensions
//    use, and it makes a large difference — 4% of a £2,500 monthly gross is
//    £100, but 4% of qualifying earnings is £79.20.
export type PercentBasis = 'gross' | 'qualifying_earnings'

export interface SalaryDeduction {
  id: string
  name: string
  type: DeductionType
  amountType: DeductionAmountType
  // £ per pay period if amountType is 'fixed', or a % if 'percent'.
  // Percentage deductions are always calculated against the original gross (or
  // qualifying earnings) for the period, not a running total after earlier
  // deductions — matches how real payslips compute each percentage line
  // independently. The result is truncated to the penny, as payroll does.
  amount: number
  // Only meaningful when amountType is 'percent'. Defaults to 'gross' so that
  // existing saved data keeps its current behaviour.
  percentBasis?: PercentBasis
}

export interface TaxYearConstants {
  personalAllowance: number
  personalAllowanceTaperStart: number
  personalAllowanceTaperEnd: number
  basicRateLimit: number // upper bound of basic rate band (England/Wales/NI)
  higherRateLimit: number // upper bound of higher rate band
  basicRate: number
  higherRate: number
  additionalRate: number
  niPrimaryThreshold: number
  niUpperEarningsLimit: number
  niMainRate: number
  niUpperRate: number
}

export const TAX_YEAR_2026_27: TaxYearConstants = {
  personalAllowance: 12570,
  personalAllowanceTaperStart: 100000,
  personalAllowanceTaperEnd: 125140,
  basicRateLimit: 50270,
  higherRateLimit: 125140,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  niPrimaryThreshold: 12570,
  niUpperEarningsLimit: 50270,
  niMainRate: 0.08,
  niUpperRate: 0.02,
}

// HMRC's published PER-PERIOD thresholds. These are hardcoded rather than derived
// from the annual figures because HMRC's own rounding doesn't follow a single
// consistent rule, and guessing it wrong shows up as pennies on every payslip:
//   Monthly NI PT £1,048  (12570/12 = 1047.50, rounded up)
//   4-weekly NI PT  £967  (12570/13 =  966.92, rounded up — NOT 4 × £242 = £968)
// The monthly and 4-weekly NI figures are both validated against real payslips
// in scripts/verify.ts. The 4-weekly upper earnings limit is derived (50270/13)
// and is NOT payslip-validated — neither current user earns near it.
export interface PeriodThresholds {
  niPrimaryThreshold: number
  niUpperEarningsLimit: number
  qualifyingEarningsLower: number
  qualifyingEarningsUpper: number
}

export const PERIOD_THRESHOLDS_2026_27: Record<PayFrequency, PeriodThresholds> = {
  monthly: {
    niPrimaryThreshold: 1048,
    niUpperEarningsLimit: 4189,
    qualifyingEarningsLower: 520,
    qualifyingEarningsUpper: 4189,
  },
  four_weekly: {
    niPrimaryThreshold: 967,
    niUpperEarningsLimit: 3867,
    qualifyingEarningsLower: 480,
    qualifyingEarningsUpper: 3867,
  },
}

export const STUDENT_LOAN_THRESHOLDS_2026_27: Record<Exclude<StudentLoanPlan, 'none'>, { threshold: number; rate: number }> = {
  plan1: { threshold: 26900, rate: 0.09 },
  plan2: { threshold: 29385, rate: 0.09 },
  plan4: { threshold: 33795, rate: 0.09 },
  plan5: { threshold: 25000, rate: 0.09 },
  postgrad: { threshold: 21000, rate: 0.06 },
}

export function periodsPerYearFor(frequency: PayFrequency): number {
  return frequency === 'four_weekly' ? 13 : 12
}

// --- Money rounding helpers -------------------------------------------------
// Float arithmetic makes exact boundaries unreliable (0.1 + 0.2 !== 0.3), so each
// helper nudges by a tiny epsilon before rounding to avoid landing a penny out on
// values that are mathematically exact.
const EPS = 1e-9
/** Truncate down to the penny — used for tax due and percentage deductions. */
export const floorPenny = (n: number): number => Math.floor(n * 100 + EPS) / 100
/** Round up to the penny — used for free pay and band widths. */
export const ceilPenny = (n: number): number => Math.ceil(n * 100 - EPS) / 100
/** Round to the nearest penny — used for National Insurance. */
export const roundPenny = (n: number): number => Math.round(n * 100) / 100

export interface TaxCodeResult {
  allowance: number
  flatRate: 'BR' | 'D0' | 'D1' | 'NT' | null
  isKCode: boolean
  /** True for W1/M1/X codes. Informational — this engine is non-cumulative anyway. */
  isNonCumulative: boolean
}

/**
 * Parses a UK tax code into an effective annual allowance (or flat-rate instruction).
 *
 * The numeric part maps to an allowance of (digits × 10) + 9 — a 1257L code is
 * £12,579 of allowance, not £12,570. Handles S (Scotland) and C (Wales) prefixes
 * and W1/M1/X suffixes by stripping them.
 */
export function parseTaxCode(code: string): TaxCodeResult {
  let c = code.trim().toUpperCase().replace(/\s+/g, '')

  // Strip a W1/M1/X non-cumulative suffix.
  let isNonCumulative = false
  const suffixMatch = c.match(/(W1M1|W1|M1|X)$/)
  if (suffixMatch && c.length > suffixMatch[1].length) {
    isNonCumulative = true
    c = c.slice(0, c.length - suffixMatch[1].length)
  }

  // Strip a regional prefix (S = Scotland, C = Wales). Scottish rate bands are not
  // modelled — an S code is treated as its rest-of-UK equivalent.
  if (/^[SC]/.test(c) && c.length > 1) c = c.slice(1)

  const base = { isKCode: false, isNonCumulative }

  if (c === 'BR') return { allowance: 0, flatRate: 'BR' as const, ...base }
  if (c === 'D0') return { allowance: 0, flatRate: 'D0' as const, ...base }
  if (c === 'D1') return { allowance: 0, flatRate: 'D1' as const, ...base }
  if (c === 'NT') return { allowance: 0, flatRate: 'NT' as const, ...base }
  if (c === '0T') return { allowance: 0, flatRate: null, ...base }

  const kMatch = c.match(/^K(\d+)$/)
  if (kMatch) {
    // A K code represents additional notional pay rather than an allowance.
    return { allowance: -(parseInt(kMatch[1], 10) * 10 + 9), flatRate: null, isKCode: true, isNonCumulative }
  }

  const match = c.match(/^(\d+)[LMNT]?$/)
  if (match) {
    return { allowance: parseInt(match[1], 10) * 10 + 9, flatRate: null, ...base }
  }

  return { allowance: TAX_YEAR_2026_27.personalAllowance, flatRate: null, ...base }
}

/** The £100k personal allowance taper: £1 of allowance lost per £2 of income over the start. */
export function personalAllowanceTaperReduction(
  adjustedNetIncome: number,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): number {
  if (adjustedNetIncome <= constants.personalAllowanceTaperStart) return 0
  return Math.floor((adjustedNetIncome - constants.personalAllowanceTaperStart) / 2)
}

/** Personal allowance after the £100k taper, before applying tax-code overrides. */
export function taperedPersonalAllowance(
  adjustedNetIncome: number,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): number {
  return Math.max(0, constants.personalAllowance - personalAllowanceTaperReduction(adjustedNetIncome, constants))
}

export interface IncomeTaxBreakdown {
  totalTax: number
  bands: { label: string; amount: number; rate: number; tax: number }[]
  allowanceUsed: number
}

/**
 * Income tax for one pay period, England/Wales/NI.
 *
 * `taxablePayForPeriod` is pay for the period after free pay has been deducted.
 * It is rounded DOWN to whole pounds first (HMRC Taxable Pay Tables), then the
 * resulting tax is truncated to the penny. Band widths are the annual widths
 * divided by the number of periods.
 */
export function calculateIncomeTaxForPeriod(
  taxablePayForPeriod: number,
  periodsPerYear: number,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): IncomeTaxBreakdown {
  const taxable = Math.max(0, Math.floor(taxablePayForPeriod + EPS))

  const basicBandSize = ceilPenny((constants.basicRateLimit - constants.personalAllowance) / periodsPerYear)
  const higherBandSize = ceilPenny((constants.higherRateLimit - constants.basicRateLimit) / periodsPerYear)

  const basicAmount = Math.min(taxable, basicBandSize)
  const higherAmount = Math.min(Math.max(0, taxable - basicBandSize), higherBandSize)
  const additionalAmount = Math.max(0, taxable - basicBandSize - higherBandSize)

  const bands: IncomeTaxBreakdown['bands'] = [
    { label: 'Basic rate (20%)', amount: basicAmount, rate: constants.basicRate, tax: floorPenny(basicAmount * constants.basicRate) },
    { label: 'Higher rate (40%)', amount: higherAmount, rate: constants.higherRate, tax: floorPenny(higherAmount * constants.higherRate) },
    { label: 'Additional rate (45%)', amount: additionalAmount, rate: constants.additionalRate, tax: floorPenny(additionalAmount * constants.additionalRate) },
  ]

  return { totalTax: floorPenny(bands.reduce((sum, b) => sum + b.tax, 0)), bands, allowanceUsed: 0 }
}

/** National Insurance for one pay period, using HMRC's published per-period thresholds. */
export function calculateNationalInsuranceForPeriod(
  niablePayForPeriod: number,
  thresholds: PeriodThresholds,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): { total: number; mainRateAmount: number; upperRateAmount: number } {
  const mainBand = Math.max(0, Math.min(niablePayForPeriod, thresholds.niUpperEarningsLimit) - thresholds.niPrimaryThreshold)
  const upperBand = Math.max(0, niablePayForPeriod - thresholds.niUpperEarningsLimit)
  const mainRateAmount = roundPenny(mainBand * constants.niMainRate)
  const upperRateAmount = roundPenny(upperBand * constants.niUpperRate)
  return { total: roundPenny(mainRateAmount + upperRateAmount), mainRateAmount, upperRateAmount }
}

/**
 * Student loan repayment for one pay period.
 *
 * Based on NI-able pay (so salary sacrifice reduces it, but a net-pay-arrangement
 * pension does not), and always truncated DOWN to a whole pound.
 */
export function calculateStudentLoanForPeriod(
  niablePayForPeriod: number,
  plan: StudentLoanPlan,
  periodsPerYear: number
): number {
  if (plan === 'none') return 0
  const { threshold, rate } = STUDENT_LOAN_THRESHOLDS_2026_27[plan]
  const periodThreshold = threshold / periodsPerYear
  const over = Math.max(0, niablePayForPeriod - periodThreshold)
  return Math.floor(over * rate + EPS)
}

export interface SalaryInput {
  grossAnnual: number
  taxCode: string
  studentLoanPlan: StudentLoanPlan
  payFrequency: PayFrequency
  deductions: SalaryDeduction[]
  employerPensionPercent?: number // informational only — doesn't affect your own take-home
}

export interface DeductionResult {
  id: string
  name: string
  type: DeductionType
  amountPerPeriod: number
  runningTotalAfter: number
}

export interface SalaryBreakdown {
  grossAnnual: number
  periodsPerYear: number
  grossPerPeriod: number
  // Deductions that reduce tax/NI before they're calculated (salary_sacrifice, net_pay)
  preTaxDeductions: DeductionResult[]
  grossTaxablePerPeriod: number
  grossNiablePerPeriod: number
  freePayPerPeriod: number
  taxablePayPerPeriod: number // after free pay, rounded down to whole pounds
  incomeTaxPerPeriod: number
  nationalInsurancePerPeriod: number
  studentLoanPerPeriod: number
  // Deductions taken from net pay, no effect on tax/NI (relief_at_source, post_tax)
  postTaxDeductions: DeductionResult[]
  netPerPeriod: number
  netAnnual: number
  netMonthly: number // always annual/12, a standard reference figure
  netWeekly: number
  employerPensionContributionPerPeriod: number
  personalAllowance: number
  taxBreakdown: IncomeTaxBreakdown
}

function resolveAmount(
  deduction: SalaryDeduction,
  grossPerPeriod: number,
  thresholds: PeriodThresholds
): number {
  if (deduction.amountType !== 'percent') return deduction.amount
  const basis =
    deduction.percentBasis === 'qualifying_earnings'
      ? Math.max(0, Math.min(grossPerPeriod, thresholds.qualifyingEarningsUpper) - thresholds.qualifyingEarningsLower)
      : grossPerPeriod
  // Payroll truncates each percentage line to the penny rather than rounding.
  return floorPenny((deduction.amount / 100) * basis)
}

/** Full net-salary calculation for one pay period, walking a person's ordered deductions. */
export function calculateNetSalary(input: SalaryInput, constants: TaxYearConstants = TAX_YEAR_2026_27): SalaryBreakdown {
  const periodsPerYear = periodsPerYearFor(input.payFrequency)
  const thresholds = PERIOD_THRESHOLDS_2026_27[input.payFrequency]
  const grossPerPeriod = input.grossAnnual / periodsPerYear

  const deductions = input.deductions ?? []

  // --- Phase 1: deductions that affect tax/NI, in the order given ---
  let runningTotal = grossPerPeriod
  let taxableGrossPerPeriod = grossPerPeriod
  let niableGrossPerPeriod = grossPerPeriod
  const preTaxDeductions: DeductionResult[] = []

  for (const d of deductions) {
    if (d.type !== 'salary_sacrifice' && d.type !== 'net_pay') continue
    const amount = resolveAmount(d, grossPerPeriod, thresholds)
    runningTotal -= amount
    taxableGrossPerPeriod -= amount
    if (d.type === 'salary_sacrifice') niableGrossPerPeriod -= amount
    preTaxDeductions.push({ id: d.id, name: d.name, type: d.type, amountPerPeriod: amount, runningTotalAfter: roundPenny(runningTotal) })
  }

  taxableGrossPerPeriod = roundPenny(taxableGrossPerPeriod)
  niableGrossPerPeriod = roundPenny(niableGrossPerPeriod)

  // --- Phase 2: allowance, then tax / NI / student loan on the per-period figures ---
  const taxCodeResult = parseTaxCode(input.taxCode)
  const annualTaxableGross = taxableGrossPerPeriod * periodsPerYear

  // The taper reduces whatever allowance the tax code grants. Previously this was
  // `min(taperedStandardAllowance, codeAllowance)`, which silently capped any code
  // above 1257L at £12,570.
  const taperReduction = personalAllowanceTaperReduction(annualTaxableGross, constants)
  const allowance = taxCodeResult.isKCode
    ? taxCodeResult.allowance
    : Math.max(0, taxCodeResult.allowance - taperReduction)

  // Free pay per period. HMRC rounds free pay UP to the penny; for a K code the
  // "allowance" is negative additional pay, which is rounded DOWN instead.
  const freePayPerPeriod = allowance >= 0 ? ceilPenny(allowance / periodsPerYear) : -floorPenny(-allowance / periodsPerYear)

  let taxBreakdown: IncomeTaxBreakdown
  let taxablePayPerPeriod = 0

  if (taxCodeResult.flatRate === 'NT') {
    taxBreakdown = { totalTax: 0, bands: [], allowanceUsed: 0 }
  } else if (taxCodeResult.flatRate) {
    taxablePayPerPeriod = Math.max(0, Math.floor(taxableGrossPerPeriod + EPS))
    const rate =
      taxCodeResult.flatRate === 'BR' ? constants.basicRate : taxCodeResult.flatRate === 'D0' ? constants.higherRate : constants.additionalRate
    const label =
      taxCodeResult.flatRate === 'BR'
        ? 'Basic rate (20%, BR code)'
        : taxCodeResult.flatRate === 'D0'
          ? 'Higher rate (40%, D0 code)'
          : 'Additional rate (45%, D1 code)'
    const tax = floorPenny(taxablePayPerPeriod * rate)
    taxBreakdown = { totalTax: tax, bands: [{ label, amount: taxablePayPerPeriod, rate, tax }], allowanceUsed: 0 }
  } else {
    taxablePayPerPeriod = Math.max(0, Math.floor(taxableGrossPerPeriod - freePayPerPeriod + EPS))
    taxBreakdown = calculateIncomeTaxForPeriod(taxablePayPerPeriod, periodsPerYear, constants)
    taxBreakdown.allowanceUsed = allowance
  }

  const incomeTaxPerPeriod = taxBreakdown.totalTax
  const ni = calculateNationalInsuranceForPeriod(niableGrossPerPeriod, thresholds, constants)
  const nationalInsurancePerPeriod = ni.total
  const studentLoanPerPeriod = calculateStudentLoanForPeriod(niableGrossPerPeriod, input.studentLoanPlan, periodsPerYear)

  runningTotal -= incomeTaxPerPeriod + nationalInsurancePerPeriod + studentLoanPerPeriod

  // --- Phase 3: deductions taken from net pay, no effect on tax/NI ---
  const postTaxDeductions: DeductionResult[] = []
  for (const d of deductions) {
    if (d.type !== 'relief_at_source' && d.type !== 'post_tax') continue
    const amount = resolveAmount(d, grossPerPeriod, thresholds)
    runningTotal -= amount
    postTaxDeductions.push({ id: d.id, name: d.name, type: d.type, amountPerPeriod: amount, runningTotalAfter: roundPenny(runningTotal) })
  }

  const netPerPeriod = roundPenny(runningTotal)
  const netAnnual = roundPenny(netPerPeriod * periodsPerYear)
  const employerPensionContributionPerPeriod = floorPenny(((input.employerPensionPercent ?? 0) / 100) * grossPerPeriod)

  return {
    grossAnnual: input.grossAnnual,
    periodsPerYear,
    grossPerPeriod,
    preTaxDeductions,
    grossTaxablePerPeriod: taxableGrossPerPeriod,
    grossNiablePerPeriod: niableGrossPerPeriod,
    freePayPerPeriod,
    taxablePayPerPeriod,
    incomeTaxPerPeriod,
    nationalInsurancePerPeriod,
    studentLoanPerPeriod,
    postTaxDeductions,
    netPerPeriod,
    netAnnual,
    netMonthly: netAnnual / 12,
    netWeekly: netAnnual / 52,
    employerPensionContributionPerPeriod,
    personalAllowance: allowance,
    taxBreakdown,
  }
}
