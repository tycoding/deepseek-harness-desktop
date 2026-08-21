import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import css from './BrowserPanel.module.css'

/** Props for a panel-edge resize control. */
export interface PanelResizeHandleProps {
  /** Edge whose inward drag increases the panel size. */
  edge: 'left' | 'top'
  /** Current panel size in CSS pixels. */
  size: number
  /** Apply a requested panel size after the owner enforces its limits. */
  onResize: (size: number) => void
}

/** Render a pointer-captured resize strip with a visible grip. */
export function PanelResizeHandle({ edge, size, onResize }: PanelResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const initialSize = useRef(size)
  const latest = useRef(size)
  const frame = useRef<number | null>(null)

  const flush = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    onResize(latest.current)
  }
  const requestedSize = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const coordinate = edge === 'left' ? event.clientX : event.clientY
    return initialSize.current + origin.current - coordinate
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = edge === 'left' ? event.clientX : event.clientY
    initialSize.current = size
    latest.current = size
    setDragging(true)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = requestedSize(event)
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      onResize(latest.current)
    })
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = requestedSize(event)
    event.currentTarget.releasePointerCapture(event.pointerId)
    flush()
    setDragging(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = edge === 'left'
      ? event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0
      : event.key === 'ArrowUp' ? 16 : event.key === 'ArrowDown' ? -16 : 0
    if (delta === 0) return
    event.preventDefault()
    onResize(size + delta)
  }

  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])

  return <div
    className={css.panelResizeHandle}
    data-edge={edge}
    data-dragging={dragging || undefined}
    role="separator"
    aria-label={edge === 'left' ? 'Resize right panel' : 'Resize bottom panel'}
    aria-orientation={edge === 'left' ? 'vertical' : 'horizontal'}
    aria-valuenow={Math.round(size)}
    tabIndex={0}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { setDragging(false) }}
    onKeyDown={onKeyDown}
  />
}
