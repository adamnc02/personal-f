import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { powerSyncDb, powerSyncConnector } from '../lib/powersync/database'

const ENABLED_PATHS = ['/salary', '/bills', '/loans', '/scenarios']
const PULL_THRESHOLD = 56 // px of pull before release triggers a refresh
const MAX_PULL = 90 // px — resistance cap
const HOLD_OFFSET = 48 // px content stays pushed down while actually refreshing
const INDICATOR_HEIGHT = 40 // px — the gap the indicator lives in, above the content

interface PullToRefreshProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}

/**
 * Real pull-to-refresh — wraps the page content and translates it
 * downward as you pull, same as native iOS: the indicator lives in the
 * gap this reveals, directly above the content's own top edge, so it can
 * never overlap a page's header/title (the previous floating-overlay
 * version could, since content never actually moved). While a refresh is
 * genuinely in flight, content stays held down at HOLD_OFFSET with the
 * spinner actively spinning — it only springs back once the refresh
 * action resolves, not the instant you lift your finger.
 *
 * Attached to #app-content — the one scroll container shared across
 * every route (see App.tsx) — gated to specific routes via the current
 * pathname. On a disabled route (Dashboard), no listeners are attached
 * at all, so the wrapped content just renders normally with no transform.
 *
 * touchmove is NOT passive while actively pulling — preventDefault()
 * stops iOS's own scroll/bounce from engaging at the same time and
 * visually fighting this gesture, which is what made this feel broken
 * on a page with real scrollable content (Bills) specifically.
 *
 * Same underlying refresh action as AccountModal's Force Sync button —
 * disconnect() then connect(), not just connect() again, since PowerSync
 * can believe it's already connected even while genuinely stuck.
 */
export function PullToRefresh({ containerRef, children }: PullToRefreshProps) {
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
      e.preventDefault()
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
        setPull(HOLD_OFFSET)
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
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [containerRef, enabled, refreshing])

  const offset = refreshing ? HOLD_OFFSET : pull
  const progress = Math.min(1, pull / PULL_THRESHOLD)

  return (
    <div style={{ position: 'relative' }}>
      {enabled && (
        <div
          className="absolute left-0 right-0 flex items-end justify-center pointer-events-none"
          style={{
            top: -INDICATOR_HEIGHT,
            height: INDICATOR_HEIGHT,
            transform: `translateY(${offset}px)`,
            opacity: offset > 4 ? 1 : 0,
          }}
        >
          <div
            className="mb-1 w-8 h-8 rounded-full flex items-center justify-center shadow"
            style={{ background: 'var(--color-surface)' }}
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
      )}
      <div
        style={{
          transform: `translateY(${offset}px)`,
          transition: pulling.current ? 'none' : 'transform 0.25s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}
