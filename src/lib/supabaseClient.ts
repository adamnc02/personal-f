import { createClient } from '@supabase/supabase-js'

// Same shared project as my-dream-clean and (eventually) personal-finance-
// ledger — see HANDOFF.md. Pulled from Vite env vars rather than hardcoded
// (unlike BLOC's single-file HTML, which has no build step to source these
// from) so the same code works locally and once deployed, without ever
// needing to hand-edit a committed value. The anon/publishable key is safe
// to ship client-side by design — RLS is what actually protects data, not
// keeping this secret.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fails loudly at boot rather than silently no-op'ing every auth/data
  // call — matches HANDOFF.md's "flag, don't silently default" principle.
  // See .env.example for what to copy into .env.local.
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in the shared project values from PROJECT-SETUP-INSTRUCTIONS.md.',
  )
}

// Default schema is personal_finance, so every `.from()`/`.rpc()` call in
// this app targets it without needing `.schema('personal_finance')` on
// every call site — see PWA-MIGRATION.md's note on this being set once at
// createClient() time. `supabase.auth.*` calls are unaffected by this;
// auth always talks to its own endpoint regardless of the default schema.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'personal_finance' },
})

/**
 * OAuth provider list, same shape/intent as BLOC's `AUTH_PROVIDERS` config
 * array — one line to add Apple/Microsoft later, no markup changes needed
 * in AuthGate. Currently just Google, per PROJECT-SETUP-INSTRUCTIONS.md
 * ("Enable Google matching BLOC's current AUTH_PROVIDERS").
 */
export const AUTH_PROVIDERS = [{ id: 'google', provider: 'google' as const, label: 'Continue with Google' }]
