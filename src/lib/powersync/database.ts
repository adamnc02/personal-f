import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web'
import { AppSchema } from './schema'

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
