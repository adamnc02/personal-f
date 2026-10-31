import type { AbstractPowerSyncDatabase, CrudEntry, PowerSyncBackendConnector } from '@powersync/web'
import { UpdateType } from '@powersync/web'
import { supabase } from '../supabaseClient'
import { isPermanentRejection, uploadAuthorization } from './uploadAuth'

const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL

if (!POWERSYNC_URL) {
  throw new Error("Missing VITE_POWERSYNC_URL. Copy it from the PowerSync Dashboard's Connect button into .env.local.")
}

// Which refusals are permanent (and discarded) lives in uploadAuth.ts, with
// the session check: a lapsed sign-in sends the publishable key, the upload
// runs as `anon`, and its 42501 must be retried, not discarded
// (MIGRATION-LESSONS §77).

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
      // Throws with no session, so the whole transaction stays queued.
      const authorization = await uploadAuthorization(() => supabase.auth.getSession())
      for (const op of transaction.crud) {
        lastOp = op
        const table = supabase.from(op.table)
        let result

        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...op.opData, id: op.id }
            result = await table.upsert(record).setHeader('Authorization', authorization)
            break
          }
          case UpdateType.PATCH: {
            result = await table.update(op.opData ?? {}).eq('id', op.id).setHeader('Authorization', authorization)
            break
          }
          case UpdateType.DELETE: {
            result = await table.delete().eq('id', op.id).setHeader('Authorization', authorization)
            break
          }
        }

        if (result?.error) {
          if (isPermanentRejection(result.error)) {
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
