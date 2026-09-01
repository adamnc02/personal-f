import type { AppData, Person } from '../types/models'

export interface DuplicatePersonMatch {
  /** The unclaimed "guess" row — e.g. Adam's guess of "Ella" before she ever linked. */
  duplicate: Person
  /** The real, linked row for the same human — linkedUserId is set. */
  linked: Person
}

/**
 * Finds people rows that are very likely the same human represented twice:
 * one row nobody has claimed (linkedUserId unset — someone's guess), and
 * one row that IS a real linked person (linkedUserId set), sharing a name.
 *
 * This can currently only happen after a household merge (see the
 * `redeem_household_link_code` migration comment for the full scenario),
 * but is written as a general local check — not tied to any one merge
 * event — so it also catches the same situation if it ever arises another
 * way (e.g. manual data entry after a merge, or a future import).
 *
 * Deliberately conservative: only flags, never deletes or merges anything
 * itself. Matching is by exact case-insensitive name only; no fuzzy
 * matching, to avoid false positives on two genuinely different people
 * who happen to share a first name.
 */
export function findDuplicatePeople(data: AppData): DuplicatePersonMatch[] {
  const linkedByName = new Map<string, Person>()
  for (const p of data.people) {
    if (p.linkedUserId) {
      linkedByName.set(normalizeName(p.name), p)
    }
  }

  const matches: DuplicatePersonMatch[] = []
  for (const p of data.people) {
    if (p.linkedUserId) continue
    const linked = linkedByName.get(normalizeName(p.name))
    if (linked && linked.id !== p.id) {
      matches.push({ duplicate: p, linked })
    }
  }
  return matches
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export interface MergeDuplicateResult {
  bills: AppData['bills']
  loans: AppData['loans']
  people: AppData['people']
}

/**
 * Re-parents the duplicate row's PERSONAL bills/loans onto the linked
 * row, then removes the duplicate row. Joint items are untouched (they
 * have no single owner to reassign). Returns new arrays — caller is
 * expected to feed these into the existing AppContext update functions
 * (replaceBills / replaceLoans / removePerson) rather than this function
 * mutating context state directly, so it stays easy to test in isolation.
 *
 * This mirrors, client-side, exactly what the `redeem_household_link_code`
 * Postgres function already does server-side during an actual merge — this
 * version exists so the same cleanup can also be triggered manually from
 * the UI (the "Merge & remove duplicate" button), including for a
 * duplicate a user spots and wants to resolve outside of a fresh redeem.
 */
export function mergeDuplicatePerson(data: AppData, match: DuplicatePersonMatch): MergeDuplicateResult {
  const bills = data.bills.map((b) =>
    b.ownerId === match.duplicate.id && b.location === 'personal' ? { ...b, ownerId: match.linked.id } : b,
  )
  const loans = data.loans.map((l) =>
    l.ownerId === match.duplicate.id && l.location === 'personal' ? { ...l, ownerId: match.linked.id } : l,
  )
  const people = data.people.filter((p) => p.id !== match.duplicate.id)

  return { bills, loans, people }
}
