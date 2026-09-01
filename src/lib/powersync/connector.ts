import type { AbstractPowerSyncDatabase, CrudEntry, PowerSyncBackendConnector } from '@powersync/web'
import { UpdateType } from '@powersync/web'
import { supabase } from '../supabaseClient'

const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL

if (!POWERSYNC_URL) {
  throw new Error("Missing VITE_POWERSYNC_URL. Copy it from the PowerSync Dashboard's Connect button into .env.local.")
}

// Errors PowerSync should NOT retry — retrying a write Postgres has
// permanently rejected (bad data shape, a constraint violation, an RLS
// denial) would just loop forever and block every later write behind it
// in the upload queue. Same list as PowerSync's own reference Supabase
// connector implementation.
const FATAL_RESPONSE_CODES = [
  /^22...$/, // Class 22 — Data Exception (e.g. type mismatch)
  /^23...$/, // Class 23 — Integrity Constraint Violation (NOT NULL/FK/UNIQUE)
  /^42501$/, // Insufficient privilege — typically an RLS denial
]

/**
 * The two methods PowerSync's client SDK calls automatically:
 *   - fetchCredentials(): supplies the PowerSync instance URL + a fresh
 *     Supabase JWT. Called on initial connect and again near token expiry
 *     — never called on every request, so no caching needed here.
 *   - uploadData(): drains the local write queue, one CRUD transaction at
 *     a time, applying each entry to the matching Supabase table. Reuses
 *     the app's existing `supabase` client (already schema-scoped to
 *     personal_finance in supabaseClient.ts) rather than creating a
 *     second client — there's no reason for two.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error || !session) {
      throw new Error(`Could not fetch Supabase credentials: ${error?.message ?? 'no session'}`)
    }

    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    let lastOp: CrudEntry | null = null
    try {
      for (const op of transaction.crud) {
        lastOp = op
        const table = supabase.from(op.table)
        let result

        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...op.opData, id: op.id }
            result = await table.upsert(record)
            break
          }
          case UpdateType.PATCH: {
            result = await table.update(op.opData ?? {}).eq('id', op.id)
            break
          }
          case UpdateType.DELETE: {
            result = await table.delete().eq('id', op.id)
            break
          }
        }

        if (result?.error) {
          const code = result.error.code ?? ''
          if (FATAL_RESPONSE_CODES.some((pattern) => pattern.test(code))) {
            // Not recoverable by retrying — log it and move on, or every
            // later write in the queue gets stuck behind a write that can
            // never succeed.
            console.error(`[powersync] Discarding unrecoverable write on ${op.table}:`, result.error)
            continue
          }
          throw new Error(`Could not update Supabase (${op.table}): ${result.error.message}`)
        }
      }

      await transaction.complete()
    } catch (err) {
      console.warn('[powersync] Upload failed, will retry:', lastOp, err)
      throw err
    }
  }
}
