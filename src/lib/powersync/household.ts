import { supabase } from '../supabaseClient'

// Cached per HANDOFF.md's own plan: "resolve the caller's current
// household first ... cached per session rather than re-queried per
// write." Keyed by user id so a sign-out/sign-in as a different account
// (shared device) can't accidentally reuse a stale household.
let cachedHouseholdId: string | null = null
let cachedForUserId: string | null = null

/**
 * Resolves the current user's household_id, creating one via
 * ensure_household() if this is genuinely their first write ever (see
 * 20260902090000_personal_finance_ensure_household.sql). This is a
 * network round-trip the first time per session; every write after that
 * reuses the cached value.
 */
export async function getHouseholdId(userId: string): Promise<string> {
  if (cachedHouseholdId && cachedForUserId === userId) return cachedHouseholdId
  const { data, error } = await supabase.rpc('ensure_household')
  if (error) throw error
  cachedHouseholdId = data
  cachedForUserId = userId
  return data
}

/** Called on sign-out — a later sign-in (possibly as a different account on a shared device) must re-resolve, not reuse this. */
export function clearHouseholdCache(): void {
  cachedHouseholdId = null
  cachedForUserId = null
}
