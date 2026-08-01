// UK tax engine — rates confirmed for the 2026/27 tax year (6 Apr 2026 – 5 Apr 2027).
// Sources: HMRC "Rates and thresholds for employers 2026 to 2027", House of Commons
// Library "Direct taxes: Rates and allowances for 2026/27".
//
// This is a take-home-pay estimator, not a payroll engine. It's accurate for the
// common case (single employment, standard tax code, PAYE) but doesn't model things
// like multiple jobs, benefits in kind, marriage allowance, or SIPP/self-assessment
// reclaims on higher/additional-rate pension relief.

export type PensionType = 'relief_at_source' | 'salary_sacrifice' | 'net_pay'
export type StudentLoanPlan = 'none' | 'plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgrad'
export type PayFrequency = 'monthly' | 'four_weekly'

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

export const STUDENT_LOAN_THRESHOLDS_2026_27: Record<Exclude<StudentLoanPlan, 'none'>, { threshold: number; rate: number }> = {
  plan1: { threshold: 26900, rate: 0.09 },
  plan2: { threshold: 29385, rate: 0.09 },
  plan4: { threshold: 33795, rate: 0.09 },
  plan5: { threshold: 25000, rate: 0.09 },
  postgrad: { threshold: 21000, rate: 0.06 },
}

export interface TaxCodeResult {
  allowance: number
  flatRate: 'BR' | 'D0' | 'D1' | 'NT' | null
  isKCode: boolean
}

/** Parses a UK tax code into an effective allowance (or flat-rate instruction). */
export function parseTaxCode(code: string): TaxCodeResult {
  const c = code.trim().toUpperCase()

  if (c === 'BR') return { allowance: 0, flatRate: 'BR', isKCode: false }
  if (c === 'D0') return { allowance: 0, flatRate: 'D0', isKCode: false }
  if (c === 'D1') return { allowance: 0, flatRate: 'D1', isKCode: false }
  if (c === 'NT') return { allowance: 0, flatRate: 'NT', isKCode: false }

  if (c.startsWith('K')) {
    const num = parseInt(c.slice(1), 10)
    // K codes represent negative allowance (deducted from pay, not added)
    return { allowance: isNaN(num) ? 0 : -(num * 10), flatRate: null, isKCode: true }
  }

  // Standard codes: number × 10 = allowance, e.g. 1257L = £12,570
  const match = c.match(/^(\d+)[LMN T]?$/)
  if (match) {
    return { allowance: parseInt(match[1], 10) * 10, flatRate: null, isKCode: false }
  }

  // 0T = no allowance, taxed across all bands
  if (c === '0T') return { allowance: 0, flatRate: null, isKCode: false }

  // Fallback to the standard personal allowance if we can't parse it
  return { allowance: TAX_YEAR_2026_27.personalAllowance, flatRate: null, isKCode: false }
}

/** Personal allowance after the £100k taper, before applying tax-code overrides. */
export function taperedPersonalAllowance(
  adjustedNetIncome: number,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): number {
  if (adjustedNetIncome <= constants.personalAllowanceTaperStart) return constants.personalAllowance
  const reduction = Math.floor((adjustedNetIncome - constants.personalAllowanceTaperStart) / 2)
  return Math.max(0, constants.personalAllowance - reduction)
}

export interface IncomeTaxBreakdown {
  totalTax: number
  bands: { label: string; amount: number; rate: number; tax: number }[]
  allowanceUsed: number
}

/** Income tax for England, Wales & Northern Ireland taxpayers. */
export function calculateIncomeTaxEWNI(
  taxableIncomeBeforeAllowance: number,
  allowance: number,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): IncomeTaxBreakdown {
  const taxable = Math.max(0, taxableIncomeBeforeAllowance - allowance)
  const bands: IncomeTaxBreakdown['bands'] = []

  const basicBandSize = constants.basicRateLimit - constants.personalAllowance
  const higherBandSize = constants.higherRateLimit - constants.basicRateLimit

  const basicAmount = Math.min(taxable, basicBandSize)
  const higherAmount = Math.min(Math.max(0, taxable - basicBandSize), higherBandSize)
  const additionalAmount = Math.max(0, taxable - basicBandSize - higherBandSize)

  bands.push({ label: 'Basic rate (20%)', amount: basicAmount, rate: constants.basicRate, tax: basicAmount * constants.basicRate })
  bands.push({ label: 'Higher rate (40%)', amount: higherAmount, rate: constants.higherRate, tax: higherAmount * constants.higherRate })
  bands.push({ label: 'Additional rate (45%)', amount: additionalAmount, rate: constants.additionalRate, tax: additionalAmount * constants.additionalRate })

  const totalTax = bands.reduce((sum, b) => sum + b.tax, 0)
  return { totalTax, bands, allowanceUsed: allowance }
}

export function calculateNationalInsurance(
  grossAnnual: number,
  constants: TaxYearConstants = TAX_YEAR_2026_27
): { total: number; mainRateAmount: number; upperRateAmount: number } {
  const mainBand = Math.max(0, Math.min(grossAnnual, constants.niUpperEarningsLimit) - constants.niPrimaryThreshold)
  const upperBand = Math.max(0, grossAnnual - constants.niUpperEarningsLimit)
  const mainRateAmount = Math.max(0, mainBand) * constants.niMainRate
  const upperRateAmount = upperBand * constants.niUpperRate
  return { total: mainRateAmount + upperRateAmount, mainRateAmount, upperRateAmount }
}

export function calculateStudentLoanRepayment(grossAnnual: number, plan: StudentLoanPlan): number {
  if (plan === 'none') return 0
  const { threshold, rate } = STUDENT_LOAN_THRESHOLDS_2026_27[plan]
  return Math.max(0, grossAnnual - threshold) * rate
}

export interface SalaryInput {
  grossAnnual: number
  taxCode: string
  pensionType: PensionType
  pensionPercent: number // employee contribution, as a percentage of gross salary
  studentLoanPlan: StudentLoanPlan
  payFrequency: PayFrequency
}

export interface SalaryBreakdown {
  grossAnnual: number
  pensionContribution: number // amount actually leaving take-home pay
  taxableIncome: number
  niableIncome: number
  incomeTax: number
  nationalInsurance: number
  studentLoan: number
  netAnnual: number
  netMonthly: number // always annual/12, a standard reference figure
  netWeekly: number
  // The actual per-payslip take-home, based on payFrequency — annual/12 for
  // monthly, annual/13 for four-weekly (13 pay periods a year). This is what
  // the rest of the app treats as "one budgeting period" for this person.
  netPerPeriod: number
  periodsPerYear: number
  personalAllowance: number
  taxBreakdown: IncomeTaxBreakdown
}

/** Full net-salary calculation, accounting for pension contribution type. */
export function calculateNetSalary(input: SalaryInput, constants: TaxYearConstants = TAX_YEAR_2026_27): SalaryBreakdown {
  const grossPension = (input.pensionPercent / 100) * input.grossAnnual

  // Determine which income figures tax and NI are calculated against, and what
  // actually leaves the payslip as a pension deduction.
  let taxableGross = input.grossAnnual
  let niableGross = input.grossAnnual
  let pensionDeductionFromPay = grossPension

  if (input.pensionType === 'salary_sacrifice') {
    taxableGross -= grossPension
    niableGross -= grossPension
    pensionDeductionFromPay = 0 // sacrificed before pay, so it's not a payslip deduction
  } else if (input.pensionType === 'net_pay') {
    taxableGross -= grossPension
    // NI still calculated on full gross for net pay arrangements
    pensionDeductionFromPay = grossPension
  }
  // relief_at_source: taxableGross/niableGross unchanged; contribution deducted from
  // net pay below, at its net cost (basic-rate relief assumed to be added by the
  // pension provider — higher/additional rate relief isn't modelled here as it's
  // usually reclaimed separately via Self Assessment)

  const taxCodeResult = parseTaxCode(input.taxCode)
  const allowance = taxCodeResult.flatRate
    ? 0
    : Math.max(0, Math.min(taperedPersonalAllowance(taxableGross, constants), taxCodeResult.allowance))

  let taxBreakdown: IncomeTaxBreakdown
  if (taxCodeResult.flatRate === 'NT') {
    taxBreakdown = { totalTax: 0, bands: [], allowanceUsed: 0 }
  } else if (taxCodeResult.flatRate === 'BR') {
    const tax = taxableGross * constants.basicRate
    taxBreakdown = { totalTax: tax, bands: [{ label: 'Basic rate (20%, BR code)', amount: taxableGross, rate: constants.basicRate, tax }], allowanceUsed: 0 }
  } else if (taxCodeResult.flatRate === 'D0') {
    const tax = taxableGross * constants.higherRate
    taxBreakdown = { totalTax: tax, bands: [{ label: 'Higher rate (40%, D0 code)', amount: taxableGross, rate: constants.higherRate, tax }], allowanceUsed: 0 }
  } else if (taxCodeResult.flatRate === 'D1') {
    const tax = taxableGross * constants.additionalRate
    taxBreakdown = { totalTax: tax, bands: [{ label: 'Additional rate (45%, D1 code)', amount: taxableGross, rate: constants.additionalRate, tax }], allowanceUsed: 0 }
  } else {
    taxBreakdown = calculateIncomeTaxEWNI(taxableGross, allowance, constants)
  }

  const ni = calculateNationalInsurance(niableGross, constants)
  const studentLoan = calculateStudentLoanRepayment(input.grossAnnual, input.studentLoanPlan)

  const netAnnual = input.grossAnnual - taxBreakdown.totalTax - ni.total - studentLoan - pensionDeductionFromPay
  const periodsPerYear = input.payFrequency === 'four_weekly' ? 13 : 12

  return {
    grossAnnual: input.grossAnnual,
    pensionContribution: pensionDeductionFromPay,
    taxableIncome: taxableGross,
    niableIncome: niableGross,
    incomeTax: taxBreakdown.totalTax,
    nationalInsurance: ni.total,
    studentLoan,
    netAnnual,
    netMonthly: netAnnual / 12,
    netWeekly: netAnnual / 52,
    netPerPeriod: netAnnual / periodsPerYear,
    periodsPerYear,
    personalAllowance: allowance,
    taxBreakdown,
  }
}
