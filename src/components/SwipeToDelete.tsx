import { useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

interface SwipeToDeleteProps {
  children: ReactNode
  onDelete: () => void
  /** Shown in a native confirm() before actually deleting — pass a short description, e.g. "Car loan". */
  confirmLabel?: string
}

const REVEAL_WIDTH = 84

export function SwipeToDelete({ children, onDelete, confirmLabel }: SwipeToDeleteProps) {
  const startX = useRef<number | null>(null)
  const startOffset = useRef(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  function handlePointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    startOffset.current = offset
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (startX.current === null) return
    const delta = e.clientX - startX.current
    const next = Math.min(0, Math.max(-REVEAL_WIDTH, startOffset.current + delta))
    setOffset(next)
  }

  function handlePointerUp() {
    setDragging(false)
    startX.current = null
    // Snap open if dragged more than halfway, otherwise snap closed
    setOffset(offset < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0)
  }

  function handleDeleteTap() {
    if (confirmLabel && !window.confirm(`Delete ${confirmLabel}? This can't be undone.`)) return
    onDelete()
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        onClick={handleDeleteTap}
        className="absolute top-0 right-0 h-full flex items-center justify-center"
        style={{ width: REVEAL_WIDTH, background: 'var(--color-negative)' }}
      >
        <Trash2 size={18} color="#fff" />
      </button>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
