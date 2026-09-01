import { supabase } from './supabaseClient'
import { exportFullBackupToJson, parseFullBackupJson } from './storage'
import type { AppData } from '../types/models'

const BUCKET = 'personal-finance-backups'

/**
 * One snapshot per calendar day, same convention as BLOC's
 * uploadSnapshot()/snapshotPath() — path is `{user_id}/{YYYY-MM-DD}.json`,
 * matching the bucket's RLS policy (scoped to the first path segment
 * matching auth.uid(), per PROJECT-SETUP-INSTRUCTIONS.md's storage
 * verification step). Re-uploading today just overwrites today's file
 * (upsert: true below) rather than piling up multiple snapshots per day.
 *
 * These are opaque JSON blobs in the app's own local shape (camelCase,
 * nested — the same AppData/AppBackup shape storage.ts already reads and
 * writes for local export/import) — Storage doesn't enforce any schema,
 * so there's no relational mapping to do here, unlike PowerSync's local
 * table mirror. Restoring uses the exact same parseFullBackupJson/
 * migrateAppData path as restoring a locally-downloaded backup file.
 */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function snapshotPath(userId: string, dateString: string = todayDateString()): string {
  return `${userId}/${dateString}.json`
}

export async function uploadSnapshot(userId: string, data: AppData): Promise<void> {
  const json = exportFullBackupToJson(data)
  const { error } = await supabase.storage.from(BUCKET).upload(snapshotPath(userId), json, {
    contentType: 'application/json',
    upsert: true,
  })
  if (error) throw error
}

export interface SnapshotInfo {
  name: string
  createdAt: string | null
}

export async function listSnapshots(userId: string): Promise<SnapshotInfo[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    sortBy: { column: 'name', order: 'desc' },
  })
  if (error) throw error
  return (data ?? [])
    .filter((f) => f.name.endsWith('.json'))
    .map((f) => ({ name: f.name, createdAt: f.created_at ?? null }))
}

export async function restoreFromSnapshot(userId: string, name: string): Promise<AppData> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${userId}/${name}`)
  if (error) throw error
  const text = await data.text()
  return parseFullBackupJson(text)
}

/**
 * Uploads a snapshot once per calendar day, silently, if today's doesn't
 * already exist — same "opportunistic daily backup" idea as BLOC's
 * maybeUploadOpportunisticSnapshot(). Never surfaced to the user;
 * failures are swallowed on purpose (best-effort, matching BLOC's own
 * comment on this: backup failures must never interrupt the local-first
 * experience or show an error for something that'll just retry next load).
 */
export async function maybeUploadOpportunisticSnapshot(userId: string, data: AppData): Promise<void> {
  try {
    const todayName = `${todayDateString()}.json`
    const snapshots = await listSnapshots(userId)
    if (snapshots.some((s) => s.name === todayName)) return
    await uploadSnapshot(userId, data)
  } catch (err) {
    console.warn('[backup] opportunistic snapshot failed, will retry next load:', err)
  }
}
