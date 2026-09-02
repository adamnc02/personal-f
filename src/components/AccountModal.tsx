import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserCircle2, X, CloudUpload, History, RefreshCw } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppContext'
import { uploadSnapshot, listSnapshots, restoreFromSnapshot, type SnapshotInfo } from '../lib/backup'
import { powerSyncDb, powerSyncConnector } from '../lib/powersync/database'

/**
 * Ported from BLOC's `updateAccountUI()` (index.html, `modal-account` +
 * `submitChangePassword()`): the "Change password" action is shown ONLY
 * for email/password accounts. OAuth accounts (Google, Apple, etc.) have
 * no BLOC/personal-f-side password at all — the provider manages that
 * themselves — so showing a change-password option for them would either
 * do nothing or confuse the user into thinking there's a separate app
 * password to manage. BLOC reads this off `session.user.app_metadata.provider`,
 * defaulting to 'email' when the field is absent (this is exactly what
 * Supabase returns for email/password accounts — there's no explicit
 * 'email' value written into app_metadata, its absence IS the signal).
 */
export function isEmailPasswordAccount(session: Session | null): boolean {
  if (!session) return false
  const provider = session.user.app_metadata?.provider || 'email'
  return provider === 'email'
}

export function providerLabel(session: Session | null): string {
  if (!session) return ''
  const provider = session.user.app_metadata?.provider || 'email'
  return provider === 'email' ? 'Signed in with email' : `Signed in with ${provider.charAt(0).toUpperCase()}${provider.slice(1)}`
}

interface AccountModalProps {
  open: boolean
  onClose: () => void
  onOpenChangePassword: () => void
}

/**
 * Identity + sign-out, opened from the profile icon on the Salary page.
 * Scoped deliberately narrower than BLOC's own Account & Data modal — this
 * app doesn't have BLOC's cloud-backup/GDPR-export sections built yet, so
 * this only covers what was actually asked for (account identity, change
 * password, sign out) rather than speculatively porting sections that
 * don't have anything behind them here yet.
 *
 * Pulls `session` straight from AuthContext rather than taking it as a
 * prop — by the time this can render at all, App.tsx's <Gate> has already
 * guaranteed a real session exists (the whole app is behind the auth
 * gate), so there's no null/undefined case left to handle here.
 */
export function AccountModal({ open, onClose, onOpenChangePassword }: AccountModalProps) {
  const { session, signOut } = useAuth()
  const { data, setData } = useAppData()
  const [backingUp, setBackingUp] = useState(false)
  const [backupStatus, setBackupStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [lastBackup, setLastBackup] = useState<SnapshotInfo | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session) return
    listSnapshots(session.user.id)
      .then((list) => setLastBackup(list[0] ?? null))
      .catch((err) => console.warn('[backup] could not load snapshot list:', err))
  }, [open, session])

  if (!open || !session) return null

  /**
   * Stand-in for real pull-to-refresh (not built yet — see HANDOFF.md).
   * disconnect() then connect(), not just connect() again, since
   * PowerSync may already consider itself "connected" even when nothing
   * is actually progressing (the exact stuck state that prompted this
   * button) — disconnecting first forces a genuinely fresh handshake
   * rather than a no-op on an already-open connection.
   */
  const forceSync = async () => {
    setSyncing(true)
    setSyncStatus(null)
    try {
      await powerSyncDb.disconnect()
      await powerSyncDb.connect(powerSyncConnector)
      setSyncStatus('Reconnected.')
    } catch (e) {
      setSyncStatus(e instanceof Error ? e.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const handleSignOut = async () => {
    onClose()
    await signOut()
  }

  const handleBackupNow = async () => {
    setBackingUp(true)
    setBackupStatus(null)
    try {
      await uploadSnapshot(session.user.id, data)
      const list = await listSnapshots(session.user.id)
      setLastBackup(list[0] ?? null)
      setBackupStatus({ text: 'Backed up.', error: false })
    } catch (e) {
      setBackupStatus({ text: e instanceof Error ? e.message : 'Backup failed.', error: true })
    } finally {
      setBackingUp(false)
    }
  }

  const openRestorePicker = async () => {
    setRestoreOpen(true)
    setBackupStatus(null)
    try {
      const list = await listSnapshots(session.user.id)
      setSnapshots(list)
    } catch (e) {
      setBackupStatus({ text: e instanceof Error ? e.message : 'Could not load backups.', error: true })
    }
  }

  const handleRestore = async (name: string) => {
    if (!confirm(`Restore the backup from ${name.replace('.json', '')}? This replaces everything currently on this device.`)) {
      return
    }
    setRestoring(name)
    setBackupStatus(null)
    try {
      const restored = await restoreFromSnapshot(session.user.id, name)
      setData(restored)
      setRestoreOpen(false)
      setBackupStatus({ text: 'Restored.', error: false })
    } catch (e) {
      setBackupStatus({ text: e instanceof Error ? e.message : 'Restore failed.', error: true })
    } finally {
      setRestoring(null)
    }
  }

  // Rendered through a portal directly to document.body — NOT just an
  // absolute/fixed CSS choice. #app-content (the scrollable page area)
  // has overflow-y-auto, and this modal is a DOM descendant of it (it's
  // rendered from Salary.tsx). An `absolute` element gets clipped by any
  // `overflow` ancestor sitting between it and its containing block —
  // #app-content sits exactly there, between this modal and #app-shell —
  // which is what actually caused it to render clipped behind the nav
  // bar (two earlier CSS-only attempts, z-index and then `absolute`,
  // both missed this — see MIGRATION-LESSONS.md). A portal removes the
  // modal from that DOM subtree entirely, so no ancestor's overflow or
  // stacking context can affect it — this is also just the standard way
  // to build modals in React generally, not a workaround specific to
  // this bug.
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5"
        style={{ background: 'var(--color-surface)', paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Account</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-[var(--color-ink-muted)]" />
          </button>
        </div>

        <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-track)' }}>
          <div className="font-display text-sm font-semibold text-[var(--color-ink)] mb-0.5">
            {session.user.email || '(no email on file)'}
          </div>
          <div className="text-xs text-[var(--color-ink-muted)]">{providerLabel(session)}</div>
          {isEmailPasswordAccount(session) && (
            <button onClick={onOpenChangePassword} className="mt-2 text-xs font-medium text-[var(--color-coral)]">
              Change password
            </button>
          )}
        </div>

        <button
          onClick={forceSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl mb-4 text-[var(--color-ink)] disabled:opacity-60"
          style={{ background: 'var(--color-track)' }}
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Force Sync'}
        </button>
        {syncStatus && (
          <p className="text-xs text-center mb-3 text-[var(--color-ink-muted)]">{syncStatus}</p>
        )}

        {restoreOpen ? (
          <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-track)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-display text-sm font-semibold text-[var(--color-ink)]">Restore a backup</div>
              <button onClick={() => setRestoreOpen(false)} className="text-xs text-[var(--color-ink-muted)]">
                Cancel
              </button>
            </div>
            {snapshots === null ? (
              <p className="text-xs text-[var(--color-ink-muted)]">Loading…</p>
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-[var(--color-ink-muted)]">No cloud backups yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {snapshots.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => handleRestore(s.name)}
                    disabled={restoring !== null}
                    className="w-full text-left text-sm py-2 px-3 rounded-xl text-[var(--color-ink)] disabled:opacity-60"
                    style={{ background: 'var(--color-surface)' }}
                  >
                    {restoring === s.name ? 'Restoring…' : s.name.replace('.json', '')}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-track)' }}>
            <div className="font-display text-sm font-semibold text-[var(--color-ink)] mb-0.5">Cloud Backup</div>
            <div className="text-xs text-[var(--color-ink-muted)] mb-3">
              {lastBackup ? `Last backed up ${lastBackup.name.replace('.json', '')}` : 'No cloud backup yet'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBackupNow}
                disabled={backingUp}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60"
              >
                <CloudUpload size={14} />
                {backingUp ? 'Backing up…' : 'Back Up Now'}
              </button>
              <button
                onClick={openRestorePicker}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl text-[var(--color-ink)]"
                style={{ background: 'var(--color-surface)' }}
              >
                <History size={14} />
                Restore
              </button>
            </div>
          </div>
        )}

        {backupStatus && (
          <p
            className="text-xs mb-3 text-center"
            style={{ color: backupStatus.error ? 'var(--color-negative)' : 'var(--color-positive)' }}
          >
            {backupStatus.text}
          </p>
        )}

        <button
          onClick={handleSignOut}
          className="w-full py-3 rounded-2xl font-semibold text-[var(--color-negative)]"
          style={{ background: 'var(--color-track)' }}
        >
          Sign Out
        </button>
      </div>
    </div>,
    document.body,
  )
}

interface ChangePasswordModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Ported from BLOC's Change Password modal: two `type="password"` fields,
 * both `autocomplete="new-password"` — the same hint used on sign-up, so
 * iOS/Safari offers its strong-password suggestion and Keychain save
 * prompt here too, rather than just masking the text. BLOC's own comment
 * on this (TECHNICAL.md §60) is worth keeping: Safari scopes AutoFill to
 * a real wrapping `<form>`, so this keeps that same structure rather than
 * two bare inputs.
 *
 * Calls `updateUser({ password })` via AuthContext — per BLOC's own
 * comment, Supabase's `updateUser()` doesn't require re-entering the
 * current password; the active session already authorizes it.
 */
export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { updatePassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const reset = () => {
    setNewPassword('')
    setConfirmPassword('')
    setStatus(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    if (!newPassword || !confirmPassword) {
      setStatus({ text: 'Enter and confirm your new password.', error: true })
      return
    }
    if (newPassword !== confirmPassword) {
      setStatus({ text: "Passwords don't match.", error: true })
      return
    }
    setSubmitting(true)
    setStatus(null)
    try {
      await updatePassword(newPassword)
      setStatus({ text: 'Password updated.', error: false })
      setTimeout(handleClose, 900)
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : 'Could not update password.', error: true })
    } finally {
      setSubmitting(false)
    }
  }

  // Rendered through a portal to document.body — see AccountModal's own
  // comment above for why (overflow-clipping via #app-content, not a
  // z-index or fixed/absolute CSS question).
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={handleClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5"
        style={{ background: 'var(--color-surface)', paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Change Password</h2>
          <button onClick={handleClose} aria-label="Close">
            <X size={20} className="text-[var(--color-ink-muted)]" />
          </button>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-ink-muted)] block mb-1">New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full text-sm py-2.5 px-3 rounded-xl outline-none text-[var(--color-ink)]"
              style={{ background: 'var(--color-track)' }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--color-ink-muted)] block mb-1">Confirm New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full text-sm py-2.5 px-3 rounded-xl outline-none text-[var(--color-ink)]"
              style={{ background: 'var(--color-track)' }}
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60"
          >
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </form>

        {status && (
          <p
            className="text-xs mt-3 text-center"
            style={{ color: status.error ? 'var(--color-negative)' : 'var(--color-positive)' }}
          >
            {status.error ? status.text : '✓ ' + status.text}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

export { UserCircle2 as AccountIcon }
