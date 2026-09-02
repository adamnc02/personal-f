import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web'
import { AppSchema } from './schema'
import { SupabaseConnector } from './connector'

/**
 * OPFSCoopSyncVFS, not the default IDBBatchAtomicVFS — PowerSync's own
 * docs are explicit that the default doesn't reliably support multi-tab
 * on Safari/iOS, and this app is a PWA that will spend most of its life
 * on iOS Safari. This is the single most relevant setting for the "keep
 * me safe from Safari crapping out" goal driving this whole build.
 */
export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'personal-finance.db',
    vfs: WASQLiteVFS.OPFSCoopSyncVFS,
  },
})

/** One shared connector instance — imported both by App.tsx (initial
 *  connect/disconnect tracking the auth session) and by anything that
 *  needs to force a fresh sync (e.g. AccountModal's manual "Force Sync",
 *  and eventually real pull-to-refresh) without creating a second one. */
export const powerSyncConnector = new SupabaseConnector()
