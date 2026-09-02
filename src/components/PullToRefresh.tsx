import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { powerSyncDb, powerSyncConnector } from '../lib/powersync/database'

const ENABLED_PATHS = ['/salary', '/bills', '/loans', '/scenarios']
const PULL_THRESHOLD = 64 // px of pull before release triggers a refresh
const MAX_PULL = 100 // px — resistance cap, matches the classic rubber-band feel

interface PullToRefreshProps {
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * The classic iOS pull-down-to-refresh gesture, attached to #app-content
 * — the single scroll container shared across every route (see
 * App.tsx) — rather than mounted per-page, since there's only ever one
 * real scrollable element to attach touch listeners to. Gated to
 * specific routes via the current pathname instead. Explicitly NOT
 * enabled on Dashboard, per Adam's own scoping.
 *
 * Does exactly what Force Sync's button does — disconnect() then
 * connect(), not just connect() again, since PowerSync can believe it's
 * already connected even while genuinely stuck (see AccountModal's own
 * comment on this) — this is the gesture-driven form of that same
 * action, not a separate mechanism.
 *
 * Only takes over the touch gesture once a genuine downward pull is
 * detected starting from scrollTop === 0 — everything else (normal
 * scrolling, scrolling down then back up) is left completely alone.
 */
export function PullToRefresh({ containerRef }: PullToRefreshProps) {
  const { pathname } = useLocation()
  const enabled = ENABLED_PATHS.includes(pathname)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pulling = useRef(false)
  const pullRef = useRef(0)

  useEffect(() => {
    pullRef.current = pull
  }, [pull])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0 || refreshing) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
      pulling.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        setPull(0)
        pulling.current = false
        return
      }
      pulling.current = true
      setPull(Math.min(MAX_PULL, delta * 0.5))
    }

    const onTouchEnd = async () => {
      if (!pulling.current) {
        startY.current = null
        return
      }
      pulling.current = false
      startY.current = null
      if (pullRef.current >= PULL_THRESHOLD) {
        setRefreshing(true)
        try {
          await powerSyncDb.disconnect()
          await powerSyncDb.connect(powerSyncConnector)
        } catch (err) {
          console.warn('[powersync] pull-to-refresh failed:', err)
        } finally {
          setRefreshing(false)
          setPull(0)
        }
      } else {
        setPull(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [containerRef, enabled, refreshing])

  if (!enabled) return null

  const active = pull > 0 || refreshing
  const progress = Math.min(1, pull / PULL_THRESHOLD)

  return (
    <div
      className="absolute left-0 right-0 flex justify-center pointer-events-none"
      style={{ top: 'var(--safe-top)', height: 0, opacity: active ? 1 : 0, zIndex: 40 }}
    >
      <div
        className="mt-3 w-8 h-8 rounded-full flex items-center justify-center shadow"
        style={{
          background: 'var(--color-surface)',
          transform: `translateY(${refreshing ? 8 : pull * 0.6}px) scale(${refreshing ? 1 : 0.6 + progress * 0.4})`,
        }}
      >
        <RefreshCw
          size={16}
          className={refreshing ? 'animate-spin' : ''}
          style={{
            color: 'var(--color-ink-muted)',
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
          }}
        />
      </div>
    </div>
  )
}
