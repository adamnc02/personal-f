import type { AppData, Bill } from '../types/models'
import { nanoid } from 'nanoid'

const STORAGE_KEY = 'ledger:app-data:v1'

export function loadAppData(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return migrateAppData(JSON.parse(raw))
  } catch (err) {
    console.error('Failed to load app data', err)
    return null
  }
}

/** Backfills fields introduced in later schema versions, for data saved by an earlier version of the app. */
export function migrateAppData(data: AppData): AppData {
  const fallbackPersonId = data.primaryPersonId ?? data.people[0]?.id ?? ''

  return {
    ...data,
    people: (data.people ?? []).map((p) => ({
      ...p,
      savingsEntries: p.savingsEntries ?? [],
      salary: { ...p.salary, payFrequency: p.salary?.payFrequency ?? 'monthly' },
    })),
    bills: (data.bills ?? []).map((b) => ({
      ...b,
      payee: b.payee ?? '',
      payeeSharePercent: typeof b.payeeSharePercent === 'number' ? b.payeeSharePercent : 50,
    })),
    loans: (data.loans ?? []).map((l) => ({
      ...l,
      location: l.location ?? 'personal',
      ownerId: l.ownerId ?? fallbackPersonId,
      payee: l.payee ?? fallbackPersonId,
      payeeSharePercent: typeof l.payeeSharePercent === 'number' ? l.payeeSharePercent : 50,
    })),
    scenarios: (data.scenarios ?? []).map((s) => ({
      ...s,
      includeInCumulative: s.includeInCumulative ?? true,
    })),
  }
}

export function saveAppData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Failed to save app data', err)
  }
}

export function defaultAppData(): AppData {
  const meId = nanoid(8)
  return {
    primaryPersonId: meId,
    people: [
      {
        id: meId,
        name: 'Me',
        color: '#ff5b4c',
        salary: {
          grossAnnual: 0,
          taxCode: '1257L',
          pensionType: 'relief_at_source',
          pensionPercent: 5,
          studentLoanPlan: 'none',
          payFrequency: 'monthly',
        },
        savingsEntries: [],
      },
    ],
    bills: [],
    loans: [],
    scenarios: [],
  }
}

// ---- Bills export/import, for sharing with a partner on a joint account ----
//
// Internally a Bill's `payee`/`ownerId` fields store a Person's id, but ids
// are randomly generated per-device — they won't match on your partner's
// copy of the app. So the exported file swaps ids for human-readable names
// ("Adam", "Ella") instead, and import resolves those names back to
// whichever ids exist locally. Both people need to exist (by name, added on
// the Salary tab) before importing.
//
// Joint bills also carry `payeeSharePercent`: the percentage of the cost
// assigned to `payeeName`, with the remainder split across everyone else.
// 100 = fully theirs, 50 = an even split.

interface PortableBill extends Omit<Bill, 'payee' | 'ownerId'> {
  payeeName: string // a person's name (joint bills only)
  ownerName: string // a person's name (personal bills only)
}

export interface BillsExport {
  version: 2
  exportedAt: string
  bills: PortableBill[]
}

/**
 * Only joint bills are exported — that's the only thing that actually needs
 * to be in sync between you and a partner, since personal bills are
 * per-person by definition and don't need sharing.
 */
export function exportBillsToJson(bills: Bill[], people: { id: string; name: string }[]): string {
  const nameById = (id: string) => people.find((p) => p.id === id)?.name ?? id
  const jointBills = bills.filter((b) => b.location === 'joint')

  const portableBills: PortableBill[] = jointBills.map(({ payee, ownerId, ...rest }) => ({
    ...rest,
    payeeName: nameById(payee),
    ownerName: nameById(ownerId),
  }))

  const payload: BillsExport = {
    version: 2,
    exportedAt: new Date().toISOString(),
    bills: portableBills,
  }
  return JSON.stringify(payload, null, 2)
}

export function downloadBillsJson(bills: Bill[], people: { id: string; name: string }[], filename = 'bills.json'): void {
  const json = exportBillsToJson(bills, people)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Replaces the joint bills entirely with whatever's in the import, while
 * leaving personal bills untouched. This is a full swap rather than a
 * per-bill upsert, so it correctly handles deletions too: if a bill was
 * removed on the exporting side, it disappears here as well rather than
 * lingering forever because it was never "matched" for removal.
 */
export function mergeImportedBills(existingBills: Bill[], importedBills: Bill[]): Bill[] {
  const personalBills = existingBills.filter((b) => b.location === 'personal')
  const newJointBills = importedBills.filter((b) => b.location === 'joint')
  return [...personalBills, ...newJointBills]
}

export function parseBillsJson(json: string, people: { id: string; name: string }[]): Bill[] {
  const parsed = JSON.parse(json)
  const bills: unknown = Array.isArray(parsed) ? parsed : parsed.bills
  if (!Array.isArray(bills)) throw new Error('Invalid bills JSON: expected an array of bills')

  const idByName = (name: string): string | null => {
    const match = people.find((p) => p.name.toLowerCase() === name.toLowerCase())
    return match?.id ?? null
  }

  return bills.map((b) => {
    const bill = b as Record<string, unknown>
    if (!bill.name || typeof bill.cost !== 'number' || typeof bill.dueDay !== 'number') {
      throw new Error(`Invalid bill entry: ${JSON.stringify(b)}`)
    }

    const location = bill.location === 'joint' ? 'joint' : 'personal'

    // Support the current name-based format, the old "Split" sentinel from
    // before percentage splits existed, and raw ids (for hand-edited files).
    let payee = ''
    let payeeSharePercent = typeof bill.payeeSharePercent === 'number' ? bill.payeeSharePercent : 50

    if (location === 'joint') {
      const rawPayee = (bill.payeeName ?? bill.payee) as string | undefined
      if (!rawPayee || rawPayee.toLowerCase() === 'split') {
        // Legacy 50/50 entry with no specific anchor person — any anchor
        // gives the same result at an even 50%, so just use whoever exists.
        payee = people[0]?.id ?? ''
        payeeSharePercent = 50
      } else {
        const resolved = idByName(rawPayee) ?? (people.some((p) => p.id === rawPayee) ? rawPayee : null)
        if (!resolved) {
          throw new Error(
            `"${bill.name}" is assigned to "${rawPayee}", but no one by that name exists yet. Add them on the Salary tab first, then re-import.`
          )
        }
        payee = resolved
        // Old exports of a fully-owned bill had no percent field — treat as 100%.
        if (typeof bill.payeeSharePercent !== 'number') payeeSharePercent = 100
      }
    }

    let ownerId = ''
    if (location === 'personal') {
      const rawOwner = (bill.ownerName ?? bill.ownerId) as string | undefined
      const resolved = rawOwner ? idByName(rawOwner) ?? (people.some((p) => p.id === rawOwner) ? rawOwner : null) : null
      if (!resolved) {
        throw new Error(
          `"${bill.name}" belongs to "${rawOwner ?? 'someone'}", but no one by that name exists yet. Add them on the Salary tab first, then re-import.`
        )
      }
      ownerId = resolved
    }

    return {
      id: (bill.id as string) ?? nanoid(8),
      name: bill.name as string,
      cost: bill.cost as number,
      dueDay: bill.dueDay as number,
      location,
      payee,
      payeeSharePercent: Math.max(0, Math.min(100, payeeSharePercent)),
      category: (bill.category as string) ?? 'Uncategorized',
      ownerId,
      isStandingOrder: (bill.isStandingOrder as boolean) ?? true,
      icon: bill.icon as string | undefined,
      iconColor: bill.iconColor as string | undefined,
    } as Bill
  })
}

// ---- Full app backup/restore ----
//
// Everything (people, salaries, bills, loans, scenarios) lives in
// localStorage, which Safari in particular can clear without warning
// (e.g. under storage pressure, or "Clear History and Website Data").
// This gives you a complete snapshot you can save somewhere durable —
// iCloud Drive, email to yourself, whatever — and restore from later.

export interface AppBackup {
  version: 1
  exportedAt: string
  app: 'finance'
  data: AppData
}

export function exportFullBackupToJson(data: AppData): string {
  const payload: AppBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'finance',
    data,
  }
  return JSON.stringify(payload, null, 2)
}

export function downloadFullBackup(data: AppData): void {
  const json = exportFullBackupToJson(data)
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `finance-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseFullBackupJson(json: string): AppData {
  const parsed = JSON.parse(json)
  const raw: unknown = parsed?.data ?? parsed // accept either the wrapped backup format or a raw AppData dump

  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as AppData).people)) {
    throw new Error('This doesn\'t look like a Finance backup file.')
  }

  return migrateAppData(raw as AppData)
}
