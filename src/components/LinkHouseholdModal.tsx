import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link2, X, Copy, Check, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

interface LinkHouseholdModalProps {
  open: boolean
  onClose: () => void
  /** Called after a successful redeem, with the RPC's jsonb summary, so
   *  the caller can decide what to do next — in particular, trigger a
   *  local data refresh/merge-review UI (DuplicatePersonBanner already
   *  handles the "flag a likely duplicate" half of this once real synced
   *  data exists; this callback is the hook for whatever kicks that off). */
  onJoined?: (result: RedeemResult) => void
}

interface RedeemResult {
  household_id: string
  brought_own_data: boolean
  own_person_id: string | null
  reparented_bills: number
  reparented_loans: number
  duplicate_person_id: string | null
  duplicate_bills_reassigned: number
  duplicate_loans_reassigned: number
}

/**
 * "Link household" modal, opened from the icon next to Salary's "New
 * Person" button. Two tabs: show/generate this household's permanent
 * code (with a "Regenerate" escape hatch calling the separate
 * `regenerate_household_link_code()` function — deliberately a distinct
 * button from "Show my code" so an idempotent read and a destructive
 * rotate can never be confused with each other), or enter someone else's
 * code to join their household.
 *
 * Both RPCs live in `personal_finance` (the client's default schema, see
 * supabaseClient.ts), so no `.schema()` override is needed per call.
 */
export function LinkHouseholdModal({ open, onClose, onJoined }: LinkHouseholdModalProps) {
  const [tab, setTab] = useState<'show' | 'join'>('show')
  const [code, setCode] = useState<string | null>(null)
  const [loadingCode, setLoadingCode] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinResult, setJoinResult] = useState<RedeemResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const loadCode = async () => {
    setLoadingCode(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('create_household_link_code')
      if (error) throw error
      setCode(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoadingCode(false)
    }
  }

  const regenerateCode = async () => {
    if (!confirm("This retires your current code — anyone who still has it won't be able to use it. Continue?")) return
    setRegenerating(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('regenerate_household_link_code')
      if (error) throw error
      setCode(data)
      setCopied(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setRegenerating(false)
    }
  }

  const copyCode = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const submitJoin = async () => {
    if (!joinCode.trim()) return
    setJoining(true)
    setError(null)
    setJoinResult(null)
    try {
      const { data, error } = await supabase.rpc('redeem_household_link_code', { p_code: joinCode.trim().toUpperCase() })
      if (error) throw error
      setJoinResult(data as RedeemResult)
      onJoined?.(data as RedeemResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setJoining(false)
    }
  }

  // Rendered through a portal to document.body — see AccountModal.tsx's
  // comment for the full explanation (overflow-clipping via #app-content,
  // not a z-index or fixed/absolute CSS question).
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--color-surface)', paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Link household</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-[var(--color-ink-muted)]" />
          </button>
        </div>

        <div className="flex rounded-full p-1 mb-4" style={{ background: 'var(--color-track)' }}>
          <button
            onClick={() => setTab('show')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-full ${tab === 'show' ? 'bg-[var(--color-surface)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
          >
            My code
          </button>
          <button
            onClick={() => setTab('join')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-full ${tab === 'join' ? 'bg-[var(--color-surface)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
          >
            Enter a code
          </button>
        </div>

        {tab === 'show' ? (
          <div>
            <p className="text-sm text-[var(--color-ink-muted)] mb-3">
              This code is permanent — it never expires and works every time you share it. Anyone who enters it joins
              your household.
            </p>
            {code ? (
              <>
                <button
                  onClick={copyCode}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-display text-2xl tracking-[0.3em] font-semibold text-[var(--color-ink)]"
                  style={{ background: 'var(--color-track)' }}
                >
                  {code}
                  {copied ? <Check size={18} /> : <Copy size={16} />}
                </button>
                <button
                  onClick={regenerateCode}
                  disabled={regenerating}
                  className="w-full flex items-center justify-center gap-1.5 mt-3 text-xs text-[var(--color-ink-muted)] disabled:opacity-60"
                >
                  <RotateCcw size={12} />
                  {regenerating ? 'Regenerating…' : 'Code leaked? Regenerate it'}
                </button>
              </>
            ) : (
              <button
                onClick={loadCode}
                disabled={loadingCode}
                className="w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60"
              >
                {loadingCode ? 'Loading…' : 'Show my code'}
              </button>
            )}
          </div>
        ) : joinResult ? (
          <div>
            <p className="text-sm text-[var(--color-ink)] mb-2 font-medium">You're linked!</p>
            <p className="text-xs text-[var(--color-ink-muted)] mb-1">
              {joinResult.brought_own_data
                ? `Your salary and ${joinResult.reparented_bills + joinResult.reparented_loans} personal item(s) came with you.`
                : "You didn't have any personal salary or bills set up, so there was nothing to bring across."}
            </p>
            {joinResult.duplicate_person_id && (
              <p className="text-xs text-[var(--color-coral)] mt-2">
                A possible duplicate of you was found in this household — check the Dashboard for a prompt to review
                and merge it.
              </p>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] mt-4"
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[var(--color-ink-muted)] mb-3">
              Enter the code from whoever's household you're joining. Your own salary and personal bills will carry
              over — everything else switches to theirs.
            </p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              maxLength={8}
              className="w-full text-center py-3 rounded-2xl font-display text-2xl tracking-[0.3em] font-semibold text-[var(--color-ink)] bg-[var(--color-track)] outline-none mb-3"
            />
            <button
              onClick={submitJoin}
              disabled={joining || !joinCode.trim()}
              className="w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60"
            >
              {joining ? 'Joining…' : 'Join household'}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-[var(--color-negative)] mt-3">{error}</p>}
      </div>
    </div>,
    document.body,
  )
}

export { Link2 as LinkHouseholdIcon }
