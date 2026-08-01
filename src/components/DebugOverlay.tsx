import { useEffect, useState } from 'react'

interface DebugValues {
  appHeight: string
  safeTop: string
  safeBottom: string
  visualViewportHeight: number | string
  innerHeight: number
  screenHeight: number
  standalone: boolean | string
  storageSyncId: string
  personCount: number
}

/**
 * TEMPORARY — always renders right now (no ?debug=1 needed) so we can see
 * this from a home-screen icon launch, which doesn't reliably share
 * localStorage-set flags with a regular Safari tab. Remove once the nav gap
 * is diagnosed.
 *
 * storageSyncId is a random id written to localStorage on first read. If it
 * comes out DIFFERENT between a Safari tab and the home-screen icon, that
 * proves the two are using separate storage — which would affect the app's
 * real data too, not just this debug flag.
 */
export function DebugOverlay() {
  const [values, setValues] = useState<DebugValues | null>(null)

  useEffect(() => {
    let syncId = localStorage.getItem('debug-sync-id')
    if (!syncId) {
      syncId = Math.random().toString(36).slice(2, 8)
      localStorage.setItem('debug-sync-id', syncId)
    }

    function read() {
      const style = getComputedStyle(document.documentElement)
      let personCount = -1
      try {
        const raw = localStorage.getItem('ledger:app-data:v1')
        personCount = raw ? (JSON.parse(raw).people?.length ?? -1) : -1
      } catch {
        personCount = -1
      }
      setValues({
        appHeight: style.getPropertyValue('--app-height').trim(),
        safeTop: style.getPropertyValue('--safe-top').trim(),
        safeBottom: style.getPropertyValue('--safe-bottom').trim(),
        visualViewportHeight: window.visualViewport?.height ?? 'n/a',
        innerHeight: window.innerHeight,
        screenHeight: window.screen?.height ?? 0,
        standalone: (window.navigator as Navigator & { standalone?: boolean }).standalone ?? 'n/a',
        storageSyncId: syncId!,
        personCount,
      })
    }

    read()
    const interval = setInterval(read, 500)
    return () => clearInterval(interval)
  }, [])

  if (!values) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 4,
        left: 4,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        color: '#4cd08a',
        fontFamily: 'monospace',
        fontSize: 10,
        lineHeight: 1.5,
        padding: '6px 8px',
        borderRadius: 6,
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {`--app-height: ${values.appHeight}
--safe-top: ${values.safeTop}
--safe-bottom: ${values.safeBottom}
visualViewport.height: ${values.visualViewportHeight}
window.innerHeight: ${values.innerHeight}
screen.height: ${values.screenHeight}
navigator.standalone: ${values.standalone}
storageSyncId: ${values.storageSyncId}
people in storage: ${values.personCount}`}
    </div>
  )
}
