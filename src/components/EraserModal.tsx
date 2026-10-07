import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import { canvasToBlob, loadImage } from '../lib/imageProcessing'
import {
  clientToImage,
  useEditorViewport,
  viewMetrics,
} from '../hooks/useEditorViewport'
import { BackButton } from './BackButton'
import { ZoomToolbar } from './ZoomToolbar'
import { useI18n } from '../i18n'
import type { ProcessedImage } from '../types'

interface EraserModalProps {
  image: ProcessedImage
  onClose: () => void
  onSave: (id: string, blob: Blob) => void
}

export function EraserModal({ image, onClose, onSave }: EraserModalProps) {
  const { m } = useI18n()
  const wrapRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const workRef = useRef<HTMLCanvasElement | null>(null)
  const originalDataRef = useRef<ImageData | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)

  const [brushSize, setBrushSize] = useState(36)
  const [mode, setMode] = useState<'restore' | 'erase'>('restore')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const {
    viewport,
    ctrlHeld,
    panningRef,
    resetView,
    zoomBy,
    onWheelZoom,
    beginPan,
    movePan,
    endPan,
    bindModifierKeys,
  } = useEditorViewport()

  const paintChecker = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const size = 12
      for (let y = 0; y < h; y += size) {
        for (let x = 0; x < w; x += size) {
          const odd = (x / size + y / size) % 2 === 0
          ctx.fillStyle = odd ? '#1a211e' : '#232b27'
          ctx.fillRect(x, y, size, size)
        }
      }
    },
    [],
  )

  const redrawDisplay = useCallback(() => {
    const display = displayRef.current
    const work = workRef.current
    const wrap = wrapRef.current
    if (!display || !work || !wrap) return

    const boxW = Math.max(1, Math.floor(wrap.clientWidth))
    const boxH = Math.max(1, Math.floor(wrap.clientHeight))
    display.width = boxW
    display.height = boxH

    const ctx = display.getContext('2d')
    if (!ctx) return

    paintChecker(ctx, boxW, boxH)
    const { scale, x, y, drawW, drawH } = viewMetrics(
      work.width,
      work.height,
      boxW,
      boxH,
      viewport,
    )
    ctx.imageSmoothingEnabled = scale < 1.5
    ctx.drawImage(work, x, y, drawW, drawH)
  }, [paintChecker, viewport])

  useEffect(() => {
    let cancelled = false

    async function setup() {
      if (!image.resultBlob) return
      const [resultImg, originalImg] = await Promise.all([
        loadImage(image.resultBlob),
        loadImage(image.file),
      ])
      if (cancelled) return

      const work = document.createElement('canvas')
      work.width = resultImg.width
      work.height = resultImg.height
      const wctx = work.getContext('2d', { willReadFrequently: true })
      if (!wctx) return
      wctx.drawImage(resultImg, 0, 0)
      workRef.current = work

      const orig = document.createElement('canvas')
      orig.width = resultImg.width
      orig.height = resultImg.height
      const octx = orig.getContext('2d', { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(originalImg, 0, 0, resultImg.width, resultImg.height)
      originalDataRef.current = octx.getImageData(0, 0, orig.width, orig.height)

      setReady(true)
      requestAnimationFrame(() => redrawDisplay())
    }

    void setup()
    return () => {
      cancelled = true
    }
  }, [image.file, image.resultBlob, redrawDisplay])

  useEffect(() => {
    if (!ready) return
    redrawDisplay()
  }, [ready, viewport, redrawDisplay])

  useEffect(() => {
    if (!ready) return
    const onResize = () => redrawDisplay()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [ready, redrawDisplay])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === 'r' || e.key === 'R') setMode('restore')
        if (e.key === 'e' || e.key === 'E') setMode('erase')
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomBy(1.15)
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomBy(1 / 1.15)
      }
      if (e.key === '0') {
        e.preventDefault()
        resetView()
      }
    }
    window.addEventListener('keydown', onKey)
    const unbind = bindModifierKeys()
    return () => {
      window.removeEventListener('keydown', onKey)
      unbind()
    }
  }, [onClose, zoomBy, resetView, bindModifierKeys])

  const toImageCoords = (clientX: number, clientY: number) => {
    const display = displayRef.current
    const work = workRef.current
    if (!display || !work) return null
    return clientToImage(
      clientX,
      clientY,
      display,
      work.width,
      work.height,
      viewport,
    )
  }

  const brushAt = (x: number, y: number, from: { x: number; y: number } | null) => {
    const work = workRef.current
    const original = originalDataRef.current
    if (!work || !original) return
    const ctx = work.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const erase = modeRef.current === 'erase'
    const radius = brushSize / 2
    const points: { x: number; y: number }[] = [{ x, y }]
    if (from) {
      const dist = Math.hypot(x - from.x, y - from.y)
      const steps = Math.max(1, Math.ceil(dist / (radius * 0.35)))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        points.push({
          x: from.x + (x - from.x) * t,
          y: from.y + (y - from.y) * t,
        })
      }
    }

    for (const p of points) {
      const x0 = Math.max(0, Math.floor(p.x - radius - 1))
      const y0 = Math.max(0, Math.floor(p.y - radius - 1))
      const x1 = Math.min(work.width, Math.ceil(p.x + radius + 1))
      const y1 = Math.min(work.height, Math.ceil(p.y + radius + 1))
      if (x1 <= x0 || y1 <= y0) continue

      const patch = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
      const { data } = patch
      const ow = original.width

      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const dx = px + 0.5 - p.x
          const dy = py + 0.5 - p.y
          const d = Math.hypot(dx, dy)
          if (d > radius) continue
          const t = 1 - d / radius
          const strength = t * t * (3 - 2 * t)

          const li = ((py - y0) * (x1 - x0) + (px - x0)) * 4
          const oi = (py * ow + px) * 4

          if (erase) {
            // Remove: apaga o sujeito (alpha → 0)
            data[li + 3] = Math.round(data[li + 3] * (1 - strength))
          } else {
            // Restaurar: traz pixels da foto original
            data[li] = Math.round(
              data[li] + (original.data[oi] - data[li]) * strength,
            )
            data[li + 1] = Math.round(
              data[li + 1] + (original.data[oi + 1] - data[li + 1]) * strength,
            )
            data[li + 2] = Math.round(
              data[li + 2] + (original.data[oi + 2] - data[li + 2]) * strength,
            )
            const targetA = Math.max(original.data[oi + 3], 255)
            data[li + 3] = Math.round(
              data[li + 3] + (targetA - data[li + 3]) * strength,
            )
          }
        }
      }
      ctx.putImageData(patch, x0, y0)
    }

    redrawDisplay()
  }

  const wantsPan = (e: ReactPointerEvent) =>
    e.ctrlKey || e.metaKey || e.button === 1 || e.button === 2

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (wantsPan(e)) {
      beginPan(e.clientX, e.clientY)
      return
    }
    endPan()
    if (e.button !== 0) return
    drawingRef.current = true
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return
    lastRef.current = pt
    brushAt(pt.x, pt.y, null)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })

    const holdingCtrl = e.ctrlKey || e.metaKey
    if (panningRef.current) {
      if (!holdingCtrl) {
        endPan()
      } else if (movePan(e.clientX, e.clientY)) {
        return
      }
    }

    if (!drawingRef.current) return
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return
    brushAt(pt.x, pt.y, lastRef.current)
    lastRef.current = pt
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastRef.current = null
    endPan()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      onWheelZoom(e, wrapRef.current)
      return
    }
    e.preventDefault()
    const step = e.deltaY < 0 ? 4 : -4
    setBrushSize((s) => Math.max(8, Math.min(120, s + step)))
  }

  const handleSave = async () => {
    const work = workRef.current
    if (!work) return
    setSaving(true)
    try {
      const blob = await canvasToBlob(work)
      onSave(image.id, blob)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const work = workRef.current
  const cursorSize =
    work && displayRef.current
      ? brushSize *
        viewMetrics(
          work.width,
          work.height,
          displayRef.current.width,
          displayRef.current.height,
          viewport,
        ).scale
      : brushSize

  return (
    <div className="eraser-modal" role="dialog" aria-modal="true" aria-label={m.eraser}>
      <div className="eraser-panel">
        <header className="eraser-header">
          <div className="eraser-header-main">
            <BackButton onClick={onClose} />
            <div className="eraser-header-text">
              <h2>{m.eraser}</h2>
              <p>{m.eraserHelp}</p>
            </div>
          </div>
        </header>

        <div className="eraser-toolbar">
          <div className="chip-row dehaze-tools">
            <button
              type="button"
              className={mode === 'restore' ? 'is-active' : ''}
              onClick={() => setMode('restore')}
              title={m.restoreKey}
            >
              {m.restore}
            </button>
            <button
              type="button"
              className={mode === 'erase' ? 'is-active' : ''}
              onClick={() => setMode('erase')}
              title={m.eraseKey}
            >
              {m.remove}
            </button>
          </div>

          <label className="eraser-brush">
            <span>{m.size}</span>
            <input
              type="range"
              min={8}
              max={120}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
            <em>{brushSize}px</em>
          </label>

          <ZoomToolbar
            zoom={viewport.zoom}
            onZoomIn={() => zoomBy(1.2)}
            onZoomOut={() => zoomBy(1 / 1.2)}
            onReset={resetView}
          />

          <div className="eraser-actions">
            <BackButton onClick={onClose} />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={!ready || saving}
            >
              {saving ? m.saving : m.apply}
            </button>
          </div>
        </div>

        <div
          className={`eraser-stage is-zoomable ${ctrlHeld ? 'is-panning' : ''}`}
          ref={wrapRef}
          onWheel={onWheel}
        >
          {!ready && <p className="eraser-loading">{m.loadingEditor}</p>}
          <div className="eraser-canvas-wrap is-fill">
            <canvas
              ref={displayRef}
              className={`eraser-canvas ${ctrlHeld ? 'is-panning' : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              onPointerLeave={() => {
                setCursor(null)
                drawingRef.current = false
                lastRef.current = null
                endPan()
              }}
            />
            {cursor && ready && !ctrlHeld && (
              <span
                className={`eraser-cursor ${mode === 'erase' ? 'is-erase' : ''}`}
                style={{
                  width: cursorSize,
                  height: cursorSize,
                  left: cursor.x,
                  top: cursor.y,
                }}
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
