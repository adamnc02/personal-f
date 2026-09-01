import { useState } from 'react'
import { UserCircle2, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'

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
  if (!open || !session) return null

  const handleSignOut = async () => {
    onClose()
    await signOut()
  }

  // absolute, not fixed — position: fixed is known to break inside this
  // app's #app-shell on iOS standalone (see BottomNav.tsx's own comment on
  // exactly this). #app-shell is position: relative and fills the screen,
  // so inset-0 against it renders identically to a true fixed overlay
  // without the iOS bug. This was the actual cause of these modals rendering
  // behind the nav bar — not z-index.
  return (
    <div className="absolute inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5"
        style={{ background: 'var(--color-surface)' }}
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
          onClick={handleSignOut}
          className="w-full py-3 rounded-2xl font-semibold text-[var(--color-negative)]"
          style={{ background: 'var(--color-track)' }}
        >
          Sign Out
        </button>
      </div>
    </div>
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

  // absolute, not fixed — position: fixed is known to break inside this
  // app's #app-shell on iOS standalone (see BottomNav.tsx's own comment on
  // exactly this). #app-shell is position: relative and fills the screen,
  // so inset-0 against it renders identically to a true fixed overlay
  // without the iOS bug. This was the actual cause of these modals rendering
  // behind the nav bar — not z-index.
  return (
    <div className="absolute inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5"
        style={{ background: 'var(--color-surface)' }}
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
    </div>
  )
}

export { UserCircle2 as AccountIcon }
