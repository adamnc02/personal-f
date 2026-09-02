import { nanoid } from 'nanoid'
import { powerSyncDb } from './database'
import { scenarioToPayload } from './mapping'
import type { Person, Bill, Loan, Scenario } from '../../types/models'
import type { SalaryDeduction } from '../tax'

// Every write needs user_id (creator) and, for people/bills/loans,
// household_id — both resolved once by AppContext and passed in here
// rather than re-resolved per call.

export async function insertPerson(userId: string, householdId: string, person: Omit<Person, 'id'>): Promise<string> {
  const id = nanoid(8)
  await powerSyncDb.execute(
    `INSERT INTO people (id, user_id, household_id, linked_user_id, name, color, gross_annual, tax_code, student_loan_plan, pay_frequency, employer_pension_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      householdId,
      person.linkedUserId ?? null,
      person.name,
      person.color,
      person.salary.grossAnnual,
      person.salary.taxCode,
      person.salary.studentLoanPlan,
      person.salary.payFrequency,
      person.salary.employerPensionPercent ?? null,
    ],
  )
  for (const d of person.salary.deductions) {
    await insertDeductionWithId(d.id, userId, id, d)
  }
  return id
}

export async function updatePerson(id: string, updates: Partial<Omit<Person, 'id'>>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.name !== undefined) {
    sets.push('name = ?')
    params.push(updates.name)
  }
  if (updates.color !== undefined) {
    sets.push('color = ?')
    params.push(updates.color)
  }
  if (updates.linkedUserId !== undefined) {
    sets.push('linked_user_id = ?')
    params.push(updates.linkedUserId ?? null)
  }
  if (updates.salary) {
    const s = updates.salary
    if (s.grossAnnual !== undefined) {
      sets.push('gross_annual = ?')
      params.push(s.grossAnnual)
    }
    if (s.taxCode !== undefined) {
      sets.push('tax_code = ?')
      params.push(s.taxCode)
    }
    if (s.studentLoanPlan !== undefined) {
      sets.push('student_loan_plan = ?')
      params.push(s.studentLoanPlan)
    }
    if (s.payFrequency !== undefined) {
      sets.push('pay_frequency = ?')
      params.push(s.payFrequency)
    }
    if (s.employerPensionPercent !== undefined) {
      sets.push('employer_pension_percent = ?')
      params.push(s.employerPensionPercent ?? null)
    }
  }

  if (sets.length > 0) {
    params.push(id)
    await powerSyncDb.execute(`UPDATE people SET ${sets.join(', ')} WHERE id = ?`, params)
  }
}

export async function removePerson(id: string): Promise<void> {
  // Postgres cascades bills/loans/salary_deductions/savings_entries owned
  // by this person on delete — the local table needs the same rows
  // removed explicitly, since PowerSync's local SQLite doesn't run
  // Postgres's own FK cascade rules.
  await powerSyncDb.execute('DELETE FROM salary_deductions WHERE person_id = ?', [id])
  await powerSyncDb.execute('DELETE FROM savings_entries WHERE person_id = ?', [id])
  await powerSyncDb.execute('UPDATE bills SET owner_id = NULL WHERE owner_id = ?', [id])
  await powerSyncDb.execute('UPDATE loans SET owner_id = NULL WHERE owner_id = ?', [id])
  await powerSyncDb.execute('DELETE FROM people WHERE id = ?', [id])
}

async function insertDeductionWithId(id: string, userId: string, personId: string, d: SalaryDeduction): Promise<void> {
  await powerSyncDb.execute(
    `INSERT INTO salary_deductions (id, user_id, person_id, name, type, amount_type, amount, percent_basis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, personId, d.name, d.type, d.amountType, d.amount, d.percentBasis ?? null],
  )
}

export async function insertDeduction(userId: string, personId: string, d: Omit<SalaryDeduction, 'id'>): Promise<string> {
  const id = nanoid(6)
  await insertDeductionWithId(id, userId, personId, { ...d, id })
  return id
}

export async function updateDeduction(id: string, updates: Partial<Omit<SalaryDeduction, 'id'>>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (updates.name !== undefined) {
    sets.push('name = ?')
    params.push(updates.name)
  }
  if (updates.type !== undefined) {
    sets.push('type = ?')
    params.push(updates.type)
  }
  if (updates.amountType !== undefined) {
    sets.push('amount_type = ?')
    params.push(updates.amountType)
  }
  if (updates.amount !== undefined) {
    sets.push('amount = ?')
    params.push(updates.amount)
  }
  if (updates.percentBasis !== undefined) {
    sets.push('percent_basis = ?')
    params.push(updates.percentBasis ?? null)
  }
  if (sets.length > 0) {
    params.push(id)
    await powerSyncDb.execute(`UPDATE salary_deductions SET ${sets.join(', ')} WHERE id = ?`, params)
  }
}

export async function removeDeduction(id: string): Promise<void> {
  await powerSyncDb.execute('DELETE FROM salary_deductions WHERE id = ?', [id])
}

export async function insertBill(userId: string, householdId: string, bill: Omit<Bill, 'id'>): Promise<string> {
  const id = nanoid(8)
  await powerSyncDb.execute(
    `INSERT INTO bills (id, user_id, household_id, owner_id, name, cost, due_day, location, payee, payee_share_percent, category, is_standing_order, icon, icon_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      householdId,
      bill.ownerId || null,
      bill.name,
      bill.cost,
      bill.dueDay,
      bill.location,
      bill.payee,
      bill.payeeSharePercent,
      bill.category,
      bill.isStandingOrder ? 1 : 0,
      bill.icon ?? null,
      bill.iconColor ?? null,
    ],
  )
  return id
}

export async function updateBill(id: string, updates: Partial<Omit<Bill, 'id'>>): Promise<void> {
  const columnMap: Record<string, string> = {
    ownerId: 'owner_id',
    name: 'name',
    cost: 'cost',
    dueDay: 'due_day',
    location: 'location',
    payee: 'payee',
    payeeSharePercent: 'payee_share_percent',
    category: 'category',
    icon: 'icon',
    iconColor: 'icon_color',
  }
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, column] of Object.entries(columnMap)) {
    const value = (updates as Record<string, unknown>)[key]
    if (value !== undefined) {
      sets.push(`${column} = ?`)
      params.push(value === '' && key === 'ownerId' ? null : value)
    }
  }
  if (updates.isStandingOrder !== undefined) {
    sets.push('is_standing_order = ?')
    params.push(updates.isStandingOrder ? 1 : 0)
  }
  if (sets.length > 0) {
    params.push(id)
    await powerSyncDb.execute(`UPDATE bills SET ${sets.join(', ')} WHERE id = ?`, params)
  }
}

export async function removeBill(id: string): Promise<void> {
  await powerSyncDb.execute('DELETE FROM bills WHERE id = ?', [id])
}

export async function insertLoan(userId: string, householdId: string, loan: Omit<Loan, 'id'>): Promise<string> {
  const id = nanoid(8)
  await powerSyncDb.execute(
    `INSERT INTO loans (id, user_id, household_id, owner_id, name, total_amount, monthly_payment, first_payment_date, location, payee, payee_share_percent, icon, icon_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      householdId,
      loan.ownerId || null,
      loan.name,
      loan.totalAmount,
      loan.monthlyPayment,
      loan.firstPaymentDate,
      loan.location,
      loan.payee,
      loan.payeeSharePercent,
      loan.icon ?? null,
      loan.iconColor ?? null,
    ],
  )
  return id
}

export async function updateLoan(id: string, updates: Partial<Omit<Loan, 'id'>>): Promise<void> {
  const columnMap: Record<string, string> = {
    ownerId: 'owner_id',
    name: 'name',
    totalAmount: 'total_amount',
    monthlyPayment: 'monthly_payment',
    firstPaymentDate: 'first_payment_date',
    location: 'location',
    payee: 'payee',
    payeeSharePercent: 'payee_share_percent',
    icon: 'icon',
    iconColor: 'icon_color',
  }
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, column] of Object.entries(columnMap)) {
    const value = (updates as Record<string, unknown>)[key]
    if (value !== undefined) {
      sets.push(`${column} = ?`)
      params.push(value === '' && key === 'ownerId' ? null : value)
    }
  }
  if (sets.length > 0) {
    params.push(id)
    await powerSyncDb.execute(`UPDATE loans SET ${sets.join(', ')} WHERE id = ?`, params)
  }
}

export async function removeLoan(id: string): Promise<void> {
  await powerSyncDb.execute('DELETE FROM loans WHERE id = ?', [id])
}

export async function insertScenario(userId: string, scenario: Omit<Scenario, 'id'>): Promise<string> {
  const id = crypto.randomUUID()
  await powerSyncDb.execute(`INSERT INTO scenarios (id, user_id, name, payload, created_at) VALUES (?, ?, ?, ?, ?)`, [
    id,
    userId,
    scenario.name,
    scenarioToPayload(scenario),
    new Date().toISOString(),
  ])
  return id
}

export async function updateScenario(id: string, current: Scenario, updates: Partial<Omit<Scenario, 'id'>>): Promise<void> {
  const merged = { ...current, ...updates }
  await powerSyncDb.execute(`UPDATE scenarios SET name = ?, payload = ? WHERE id = ?`, [
    merged.name,
    scenarioToPayload(merged),
    id,
  ])
}

export async function removeScenario(id: string): Promise<void> {
  await powerSyncDb.execute('DELETE FROM scenarios WHERE id = ?', [id])
}
