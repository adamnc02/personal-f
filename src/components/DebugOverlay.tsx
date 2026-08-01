import { useEffect, useState } from 'react'

interface DebugValues {
  appHeight: string
  safeTop: string
  safeBottom: string
  visualViewportHeight: number | string
  innerHeight: number
  screenHeight: number
  standalone: boolean | string
}

/**
 * Visit the app with ?debug=1 in the URL (e.g. https://yourname.github.io/finance-app/?debug=1#/)
 * to see the real measured values behind the safe-area/viewport-height fix, directly on-device.
 * Not linked from anywhere in the UI — remove this file once the nav gap is sorted.
 */
export function DebugOverlay() {
  const [values, setValues] = useState<DebugValues | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') !== '1') return

    function read() {
      const style = getComputedStyle(document.documentElement)
      setValues({
        appHeight: style.getPropertyValue('--app-height').trim(),
        safeTop: style.getPropertyValue('--safe-top').trim(),
        safeBottom: style.getPropertyValue('--safe-bottom').trim(),
        visualViewportHeight: window.visualViewport?.height ?? 'n/a',
        innerHeight: window.innerHeight,
        screenHeight: window.screen?.height ?? 0,
        standalone: (window.navigator as Navigator & { standalone?: boolean }).standalone ?? 'n/a',
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
navigator.standalone: ${values.standalone}`}
    </div>
  )
}
