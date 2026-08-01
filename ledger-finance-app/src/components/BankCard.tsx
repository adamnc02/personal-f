import { CreditCard } from 'lucide-react'
import type { ReactNode } from 'react'

interface BankCardProps {
  variant: 'coral' | 'light'
  bankLabel: string
  accountLabel?: string
  children: ReactNode
}

export function BankCard({ variant, bankLabel, accountLabel, children }: BankCardProps) {
  const isCoral = variant === 'coral'
  return (
    <div
      className="rounded-3xl p-7 min-h-[220px] flex flex-col justify-between shadow-lg"
      style={{
        background: isCoral ? 'linear-gradient(155deg, var(--color-coral) 0%, var(--color-coral-dark) 100%)' : 'var(--color-joint)',
        color: isCoral ? '#fff' : '#1a1a1a',
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-11 h-8 rounded-md flex items-center justify-center"
          style={{ background: isCoral ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)' }}
        >
          <CreditCard size={18} strokeWidth={1.5} />
        </div>
        <div className="text-right">
          <div className="font-display font-bold text-xl tracking-tight" style={{ color: isCoral ? '#fff' : 'var(--color-coral)' }}>
            {bankLabel}
          </div>
          {accountLabel && (
            <div className="text-xs font-medium opacity-80" style={{ color: isCoral ? '#fff' : 'var(--color-coral)' }}>
              {accountLabel}
            </div>
          )}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}
