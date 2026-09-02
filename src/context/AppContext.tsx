import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppData, Person, Bill, Loan, Scenario } from '../types/models'
import { powerSyncDb } from '../lib/powersync/database'
import { getHouseholdId } from '../lib/powersync/household'
import { personFromRows, billFromRow, loanFromRow, scenarioFromRow } from '../lib/powersync/mapping'
import type { PersonRow, SalaryDeductionRow, SavingsEntryRow, BillRow, LoanRow, ScenarioRow } from '../lib/powersync/schema'
import * as writes from '../lib/powersync/writes'
import { useAuth } from './AuthContext'

interface AppContextValue {
  data: AppData
  setData: (data: AppData) => Promise<void>

  addPerson: (person: Omit<Person, 'id'>) => Promise<string>
  updatePerson: (id: string, updates: Partial<Omit<Person, 'id'>>) => Promise<void>
  removePerson: (id: string) => Promise<void>
  setPrimaryPerson: (id: string) => void
  /** The real "Set as me" action — claims this person row as the signed-in
   *  user's own identity (writes linked_user_id, clearing it from
   *  whichever row previously had it, since only one row per household
   *  can be linked to a given user), and switches the local dashboard
   *  view to it. This is what the household merge/redeem logic actually
   *  keys off of — setPrimaryPerson alone does not touch linked_user_id. */
  setAsMe: (id: string) => Promise<void>

  addBill: (bill: Omit<Bill, 'id'>) => Promise<string>
  updateBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => Promise<void>
  removeBill: (id: string) => Promise<void>
  replaceBills: (bills: Bill[]) => Promise<void>

  addLoan: (loan: Omit<Loan, 'id'>) => Promise<string>
  updateLoan: (id: string, updates: Partial<Omit<Loan, 'id'>>) => Promise<void>
  removeLoan: (id: string) => Promise<void>
  replaceLoans: (loans: Loan[]) => Promise<void>

  addScenario: (scenario: Omit<Scenario, 'id'>) => Promise<string>
  updateScenario: (id: string, updates: Partial<Omit<Scenario, 'id'>>) => Promise<void>
  removeScenario: (id: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

/**
 * Generic live-query subscription against PowerSync's local database.
 * Uses the current `db.query().watch()` API (the AsyncIterator/callback
 * forms of `db.watch()` are maintained for backwards compatibility only,
 * per PowerSync's own docs) — `registerListener` returns a dispose
 * function, called on unmount/query change.
 */
function useWatchedRows<T>(sql: string): T[] {
  const [rows, setRows] = useState<T[]>([])

  useEffect(() => {
    const watched = powerSyncDb.query({ sql, parameters: [] }).watch()
    const dispose = watched.registerListener({
      onData: (data) => setRows(data as T[]),
      onError: (err: unknown) => console.warn('[powersync] watch query failed:', sql, err),
    })
    return () => dispose()
  }, [sql])

  return rows
}

/**
 * No WHERE clause on any of these — PowerSync's Sync Streams already
 * scope replication server-side (people/bills/loans/salary_deductions/
 * savings_entries to the caller's household, scenarios to the caller's
 * own user_id, per POWERSYNC-SETUP.md §6), so the local SQLite tables
 * only ever contain rows this device is actually allowed to see. Filtering
 * again locally would be redundant, not a safety net — the real access
 * control already happened server-side via RLS + Sync Streams.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [primaryPersonId, setPrimaryPersonId] = useState<string>('')

  const peopleRows = useWatchedRows<PersonRow>('SELECT * FROM people')
  const deductionRows = useWatchedRows<SalaryDeductionRow>('SELECT * FROM salary_deductions')
  const savingsRows = useWatchedRows<SavingsEntryRow>('SELECT * FROM savings_entries')
  const billRows = useWatchedRows<BillRow>('SELECT * FROM bills')
  const loanRows = useWatchedRows<LoanRow>('SELECT * FROM loans')
  const scenarioRows = useWatchedRows<ScenarioRow>('SELECT * FROM scenarios')

  // Resolves (and, via ensure_household(), creates if this is genuinely
  // the user's first write) the household_id every people/bills/loans
  // write needs. Requires connectivity the first time per session — see
  // household.ts's own comment; there's no offline-first bootstrap for a
  // never-before-seen household yet, flagging rather than silently
  // pretending this is solved.
  useEffect(() => {
    if (!session) {
      setHouseholdId(null)
      return
    }
    getHouseholdId(session.user.id)
      .then(setHouseholdId)
      .catch((err) => console.error('[powersync] could not resolve household:', err))
  }, [session])

  const people: Person[] = useMemo(
    () => peopleRows.map((row) => personFromRows(row, deductionRows, savingsRows)),
    [peopleRows, deductionRows, savingsRows],
  )
  const bills: Bill[] = useMemo(() => billRows.map(billFromRow), [billRows])
  const loans: Loan[] = useMemo(() => loanRows.map(loanFromRow), [loanRows])
  const scenarios: Scenario[] = useMemo(() => scenarioRows.map(scenarioFromRow), [scenarioRows])

  // Local-only "which view am I looking at" — deliberately NOT synced
  // (no column for it anywhere), separate from linkedUserId ("which row
  // structurally IS me"). Defaults to whichever person is linked to the
  // signed-in user, falling back to the first person, but only when the
  // current selection is empty or no longer exists (e.g. that person was
  // removed) — never overrides a manual switch-view choice otherwise.
  useEffect(() => {
    if (people.length === 0) return
    if (people.some((p) => p.id === primaryPersonId)) return
    const linkedToMe = people.find((p) => p.linkedUserId === session?.user.id)
    setPrimaryPersonId(linkedToMe?.id ?? people[0].id)
  }, [people, primaryPersonId, session])

  const data: AppData = useMemo(
    () => ({ people, bills, loans, scenarios, primaryPersonId }),
    [people, bills, loans, scenarios, primaryPersonId],
  )

  const requireHousehold = (): string => {
    if (!householdId) throw new Error('Still setting up your household — try again in a moment.')
    return householdId
  }
  const requireUser = (): string => {
    if (!session) throw new Error('Not signed in.')
    return session.user.id
  }

  const addPerson: AppContextValue['addPerson'] = (person) => writes.insertPerson(requireUser(), requireHousehold(), person)
  const updatePerson: AppContextValue['updatePerson'] = (id, updates) => writes.updatePerson(id, updates)
  const removePerson: AppContextValue['removePerson'] = (id) => writes.removePerson(id)
  const setPrimaryPerson: AppContextValue['setPrimaryPerson'] = (id) => setPrimaryPersonId(id)
  const setAsMe: AppContextValue['setAsMe'] = async (id) => {
    const userId = requireUser()
    const currentlyLinked = people.find((p) => p.linkedUserId === userId)
    if (currentlyLinked && currentlyLinked.id !== id) {
      await writes.clearLinkedUserId(currentlyLinked.id)
    }
    await writes.updatePerson(id, { linkedUserId: userId })
    setPrimaryPersonId(id)
  }

  const addBill: AppContextValue['addBill'] = (bill) => writes.insertBill(requireUser(), requireHousehold(), bill)
  const updateBill: AppContextValue['updateBill'] = (id, updates) => writes.updateBill(id, updates)
  const removeBill: AppContextValue['removeBill'] = (id) => writes.removeBill(id)
  // "Replace" doesn't map to a single SQL statement — only ever used
  // (DuplicatePersonBanner) to reassign ownerId on specific rows after a
  // merge, so diff against current state and update just what changed
  // rather than a destructive delete-and-reinsert of everything.
  const replaceBills: AppContextValue['replaceBills'] = async (newBills) => {
    for (const b of newBills) {
      const current = bills.find((existing) => existing.id === b.id)
      if (current && current.ownerId !== b.ownerId) {
        await writes.updateBill(b.id, { ownerId: b.ownerId })
      }
    }
  }

  const addLoan: AppContextValue['addLoan'] = (loan) => writes.insertLoan(requireUser(), requireHousehold(), loan)
  const updateLoan: AppContextValue['updateLoan'] = (id, updates) => writes.updateLoan(id, updates)
  const removeLoan: AppContextValue['removeLoan'] = (id) => writes.removeLoan(id)
  const replaceLoans: AppContextValue['replaceLoans'] = async (newLoans) => {
    for (const l of newLoans) {
      const current = loans.find((existing) => existing.id === l.id)
      if (current && current.ownerId !== l.ownerId) {
        await writes.updateLoan(l.id, { ownerId: l.ownerId })
      }
    }
  }

  const addScenario: AppContextValue['addScenario'] = (scenario) => writes.insertScenario(requireUser(), scenario)
  const updateScenario: AppContextValue['updateScenario'] = (id, updates) => {
    const current = scenarios.find((s) => s.id === id)
    if (!current) throw new Error(`No scenario with id ${id}`)
    return writes.updateScenario(id, current, updates)
  }
  const removeScenario: AppContextValue['removeScenario'] = (id) => writes.removeScenario(id)

  /**
   * Restoring a backup — used by AccountModal's Restore flow. Unlike the
   * old localStorage version, this now affects the WHOLE HOUSEHOLD, not
   * just this device: every people/bills/loans/salary_deductions/
   * savings_entries row for the household is deleted and replaced with
   * what's in the restored snapshot, and every write syncs to Postgres
   * and from there to every other device in the household. This is a
   * meaningful behavior change from before sync existed — flagging
   * clearly rather than letting it be a silent surprise. Scenarios are
   * user-scoped (not household-shared, per their own RLS), so only the
   * signed-in user's own scenarios are replaced, not a household-mate's.
   */
  const setData: AppContextValue['setData'] = async (restored) => {
    const userId = requireUser()
    const hhId = requireHousehold()
    const idMap = new Map<string, string>()

    for (const row of peopleRows) await writes.removePerson(row.id)
    for (const row of scenarioRows) await writes.removeScenario(row.id)

    for (const person of restored.people) {
      const newId = await writes.insertPerson(userId, hhId, person)
      // Bills/loans reference person ids — remap after people are
      // (re)created, since insertPerson generates a fresh id rather than
      // reusing the backup's original one (avoids ever colliding with an
      // id something else in the household already generated).
      idMap.set(person.id, newId)
    }
    for (const bill of restored.bills) {
      await writes.insertBill(userId, hhId, { ...bill, ownerId: idMap.get(bill.ownerId) ?? bill.ownerId })
    }
    for (const loan of restored.loans) {
      await writes.insertLoan(userId, hhId, { ...loan, ownerId: idMap.get(loan.ownerId) ?? loan.ownerId })
    }
    for (const scenario of restored.scenarios) {
      await writes.insertScenario(userId, scenario)
    }
  }

  return (
    <AppContext.Provider
      value={{
        data,
        setData,
        addPerson,
        updatePerson,
        removePerson,
        setPrimaryPerson,
        setAsMe,
        addBill,
        updateBill,
        removeBill,
        replaceBills,
        addLoan,
        updateLoan,
        removeLoan,
        replaceLoans,
        addScenario,
        updateScenario,
        removeScenario,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppData(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppData must be used within an AppProvider')
  return ctx
}
