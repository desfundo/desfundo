import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import { canvasToBlob, loadImage } from '../lib/imageProcessing'
import { reducePlasticGlare } from '../lib/plasticFix'
import { BackButton } from './BackButton'
import { ZoomToolbar } from './ZoomToolbar'
import type { ProcessedImage } from '../types'

interface DehazeMaskModalProps {
  image: ProcessedImage
  initialStrength: number
  onClose: () => void
  onSave: (id: string, blob: Blob) => void
}

type Tool = 'paint' | 'erase'

export function DehazeMaskModal({
  image,
  initialStrength,
  onClose,
  onSave,
}: DehazeMaskModalProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const maskRef = useRef<Uint8ClampedArray | null>(null)
  const entryBlobRef = useRef<Blob | null>(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const fitRef = useRef(1)
  const dragPanRef = useRef<{
    active: boolean
    startX: number
    startY: number
    origX: number
    origY: number
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 })

  const [brushSize, setBrushSize] = useState(48)
  const [strength, setStrength] = useState(
    initialStrength > 0 ? initialStrength : 70,
  )
  const [sharpen, setSharpen] = useState(35)
  const [tool, setTool] = useState<Tool>('paint')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showMask, setShowMask] = useState(true)
  const [flash, setFlash] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fit, setFit] = useState(1)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const [dragging, setDragging] = useState(false)
  const ctrlRef = useRef(false)
  const [detectedColor, setDetectedColor] = useState<{
    r: number
    g: number
    b: number
  } | null>(null)

  zoomRef.current = zoom
  panRef.current = pan
  fitRef.current = fit

  const paintCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const base = baseRef.current
    const mask = maskRef.current
    if (!canvas || !base || !mask) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Fundo xadrez
    const size = 16
    for (let y = 0; y < canvas.height; y += size) {
      for (let x = 0; x < canvas.width; x += size) {
        const odd = ((x / size) + (y / size)) % 2 === 0
        ctx.fillStyle = odd ? '#1a211e' : '#232b27'
        ctx.fillRect(x, y, size, size)
      }
    }

    ctx.drawImage(base, 0, 0)

    if (showMask) {
      const img = ctx.createImageData(canvas.width, canvas.height)
      for (let p = 0; p < mask.length; p++) {
        const m = mask[p]
        if (m < 4) continue
        const i = p * 4
        img.data[i] = 126
        img.data[i + 1] = 200
        img.data[i + 2] = 163
        img.data[i + 3] = Math.round(m * 0.5)
      }
      // Desenha máscara por cima via canvas temporário
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width
      tmp.height = canvas.height
      const tctx = tmp.getContext('2d')
      if (tctx) {
        tctx.putImageData(img, 0, 0)
        ctx.drawImage(tmp, 0, 0)
      }
    }
  }, [showMask])

  const updateFit = useCallback(() => {
    const stage = stageRef.current
    const base = baseRef.current
    if (!stage || !base) return
    const pad = 24
    const fw = Math.max(1, stage.clientWidth - pad)
    const fh = Math.max(1, stage.clientHeight - pad)
    const next = Math.min(fw / base.width, fh / base.height, 1)
    fitRef.current = next
    setFit(next)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function setup() {
      if (!image.resultBlob) return
      entryBlobRef.current = image.resultBlob
      const resultImg = await loadImage(image.resultBlob)
      if (cancelled) return

      const base = document.createElement('canvas')
      base.width = resultImg.width
      base.height = resultImg.height
      const bctx = base.getContext('2d')
      if (!bctx) return
      bctx.drawImage(resultImg, 0, 0)
      baseRef.current = base
      maskRef.current = new Uint8ClampedArray(base.width * base.height)

      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = base.width
        canvas.height = base.height
      }

      setImgSize({ w: base.width, h: base.height })
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setReady(true)
      setDetectedColor(null)

      requestAnimationFrame(() => {
        updateFit()
        paintCanvas()
      })
    }

    void setup()
    return () => {
      cancelled = true
    }
    // Só reabre ao trocar de imagem — não ao salvar resultado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id])

  useEffect(() => {
    if (!ready) return
    paintCanvas()
  }, [ready, showMask, paintCanvas])

  useEffect(() => {
    if (!ready) return
    const onResize = () => updateFit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [ready, updateFit])

  useEffect(() => {
    const setCtrl = (down: boolean) => {
      if (ctrlRef.current === down) {
        if (!down && dragPanRef.current.active) {
          dragPanRef.current.active = false
          setDragging(false)
        }
        return
      }
      ctrlRef.current = down
      setCtrlHeld(down)
      if (!down && dragPanRef.current.active) {
        dragPanRef.current.active = false
        setDragging(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrl(true)
      else if (e.ctrlKey || e.metaKey) setCtrl(true)

      if (e.key === 'Escape') onClose()
      if (e.key === 'e' || e.key === 'E') setTool('erase')
      if (e.key === 'b' || e.key === 'B') setTool('paint')

      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setZoom((z) => Math.min(8, z * 1.2))
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        setZoom((z) => Math.max(0.25, z / 1.2))
      }
      if (e.key === '0') {
        e.preventDefault()
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (
        e.key === 'Control' ||
        e.key === 'Meta' ||
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'MetaLeft' ||
        e.code === 'MetaRight'
      ) {
        setCtrl(false)
        return
      }
      if (!e.ctrlKey && !e.metaKey) setCtrl(false)
    }
    const onPointer = (e: PointerEvent) => {
      setCtrl(e.ctrlKey || e.metaKey)
    }
    const clearCtrl = () => setCtrl(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerup', onPointer)
    window.addEventListener('blur', clearCtrl)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerup', onPointer)
      window.removeEventListener('blur', clearCtrl)
    }
  }, [onClose])

  // Pan global com mouse/touch — independente do canvas
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragPanRef.current
      if (!drag.active) return
      if (!(e.ctrlKey || e.metaKey) && e.buttons !== 4 && !(e.buttons & 2)) {
        drag.active = false
        setDragging(false)
        ctrlRef.current = false
        setCtrlHeld(false)
        return
      }
      e.preventDefault()
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const next = { x: drag.origX + dx, y: drag.origY + dy }
      panRef.current = next
      setPan(next)
    }
    const onUp = (e: PointerEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        ctrlRef.current = false
        setCtrlHeld(false)
      }
      if (!dragPanRef.current.active) return
      dragPanRef.current.active = false
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const clientToImage = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const strokeMask = (
    x: number,
    y: number,
    from: { x: number; y: number } | null,
  ) => {
    const base = baseRef.current
    const mask = maskRef.current
    if (!base || !mask) return

    const radius = brushSize / 2
    const points: { x: number; y: number }[] = [{ x, y }]
    if (from) {
      const dist = Math.hypot(x - from.x, y - from.y)
      const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius * 0.3)))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        points.push({
          x: from.x + (x - from.x) * t,
          y: from.y + (y - from.y) * t,
        })
      }
    }

    const hard = radius * 0.55
    for (const p of points) {
      const x0 = Math.max(0, Math.floor(p.x - radius - 1))
      const y0 = Math.max(0, Math.floor(p.y - radius - 1))
      const x1 = Math.min(base.width, Math.ceil(p.x + radius + 1))
      const y1 = Math.min(base.height, Math.ceil(p.y + radius + 1))

      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const d = Math.hypot(px + 0.5 - p.x, py + 0.5 - p.y)
          if (d > radius) continue
          let soft = 1
          if (d > hard) {
            const t = 1 - (d - hard) / Math.max(0.001, radius - hard)
            soft = t * t * (3 - 2 * t)
          }
          const idx = py * base.width + px
          if (tool === 'paint') {
            mask[idx] = Math.max(mask[idx], Math.round(255 * soft))
          } else if (tool === 'erase') {
            mask[idx] = Math.round(mask[idx] * (1 - soft))
          }
        }
      }
    }
    paintCanvas()
  }

  const startPan = (clientX: number, clientY: number) => {
    dragPanRef.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      origX: panRef.current.x,
      origY: panRef.current.y,
    }
    setDragging(true)
  }

  // Só o modificador do próprio evento — não usar ctrlRef (pode ficar preso)
  const wantsPan = (e: ReactPointerEvent) =>
    e.ctrlKey || e.metaKey || e.button === 1 || e.button === 2

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!wantsPan(e)) return
    e.preventDefault()
    e.stopPropagation()
    startPan(e.clientX, e.clientY)
  }

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) e.preventDefault()

    // Garante que um pan antigo não bloqueie a pintura
    if (!wantsPan(e)) {
      dragPanRef.current.active = false
      setDragging(false)
    }

    if (wantsPan(e)) {
      e.preventDefault()
      startPan(e.clientX, e.clientY)
      return
    }

    if (e.button !== 0) return

    drawingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const pt = clientToImage(e.clientX, e.clientY)
    if (!pt) return
    lastPtRef.current = pt
    strokeMask(pt.x, pt.y, null)
  }

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Mantém Ctrl sincronizado com o mouse (evita mãozinha presa)
    const down = e.ctrlKey || e.metaKey
    if (ctrlRef.current !== down) {
      ctrlRef.current = down
      setCtrlHeld(down)
      if (!down) {
        dragPanRef.current.active = false
        setDragging(false)
      }
    }
    const stage = stageRef.current
    if (stage) {
      const rect = stage.getBoundingClientRect()
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    if (dragPanRef.current.active) return
    if (!drawingRef.current) return
    const pt = clientToImage(e.clientX, e.clientY)
    if (!pt) return
    strokeMask(pt.x, pt.y, lastPtRef.current)
    lastPtRef.current = pt
  }

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPtRef.current = null
    dragPanRef.current.active = false
    setDragging(false)
    if (!e.ctrlKey && !e.metaKey) {
      ctrlRef.current = false
      setCtrlHeld(false)
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setZoom((z) => Math.max(0.25, Math.min(8, z * factor)))
      return
    }
    // Scroll sem Ctrl = tamanho do pincel
    e.preventDefault()
    const step = e.deltaY < 0 ? 6 : -6
    setBrushSize((s) => Math.max(12, Math.min(160, s + step)))
  }

  const clearPaintMask = () => {
    const mask = maskRef.current
    if (!mask) return
    mask.fill(0)
    setShowMask(true)
    paintCanvas()
    setFlash('Máscara limpa')
    window.setTimeout(() => setFlash(null), 900)
  }

  const restoreEntry = async () => {
    const entry = entryBlobRef.current
    const base = baseRef.current
    if (!entry || !base) return
    const img = await loadImage(entry)
    const bctx = base.getContext('2d')
    if (!bctx) return
    bctx.clearRect(0, 0, base.width, base.height)
    bctx.drawImage(img, 0, 0)
    if (maskRef.current) maskRef.current.fill(0)
    setDetectedColor(null)
    onSave(image.id, entry)
    paintCanvas()
    setFlash('Restaurado')
    window.setTimeout(() => setFlash(null), 1000)
  }

  const handleLimpar = () => {
    const mask = maskRef.current
    let painted = 0
    if (mask) {
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 8) painted++
      }
    }
    if (painted > 0) {
      clearPaintMask()
      return
    }
    void restoreEntry()
  }

  const selectAll = () => {
    const mask = maskRef.current
    if (!mask) return
    mask.fill(255)
    setShowMask(true)
    paintCanvas()
  }

  const handleApply = async () => {
    const base = baseRef.current
    const mask = maskRef.current
    if (!base || !mask) return

    let covered = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 8) covered++
    }
    if (covered === 0) {
      window.alert('Pinte a área com reflexo/embaçamento antes de aplicar.')
      return
    }

    setSaving(true)
    try {
      const before = await canvasToBlob(base)
      const maskCopy = new Uint8ClampedArray(mask)
      const { blob: result, color } = await reducePlasticGlare(
        before,
        strength,
        maskCopy,
        image.file,
        sharpen,
      )
      const resultImg = await loadImage(result)
      const bctx = base.getContext('2d')
      if (!bctx) return
      bctx.clearRect(0, 0, base.width, base.height)
      bctx.drawImage(resultImg, 0, 0)
      mask.fill(0)
      setDetectedColor(color)
      onSave(image.id, result)
      paintCanvas()
      setFlash('Reflexo corrigido + nitidez')
      window.setTimeout(() => setFlash(null), 1400)
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'Falha ao aplicar anti-reflexo',
      )
    } finally {
      setSaving(false)
    }
  }

  const displayW = imgSize.w * fit
  const displayH = imgSize.h * fit
  const scale = fit * zoom
  const cursorSize = brushSize * scale
  const isPanning = ctrlHeld || dragging

  return (
    <div
      className="eraser-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar área do anti-reflexo"
    >
      <div className="eraser-panel">
        <header className="eraser-header">
          <div className="eraser-header-main">
            <BackButton onClick={onClose} />
            <div className="eraser-header-text">
              <h2>Anti-reflexo + nitidez</h2>
              <p>
                Segure <strong>Ctrl</strong> + arraste para mover ·{' '}
                <strong>Ctrl</strong> + scroll para zoom · scroll para o
                tamanho do pincel.
              </p>
            </div>
          </div>
        </header>

        <div className="eraser-toolbar dehaze-toolbar">
          <div className="chip-row dehaze-tools">
            <button
              type="button"
              className={tool === 'paint' ? 'is-active' : ''}
              onClick={() => setTool('paint')}
            >
              Pintar
            </button>
            <button
              type="button"
              className={tool === 'erase' ? 'is-active' : ''}
              onClick={() => setTool('erase')}
            >
              Apagar máscara
            </button>
            <button type="button" onClick={selectAll}>
              Tudo
            </button>
            <button type="button" onClick={handleLimpar}>
              Limpar
            </button>
          </div>

          <label className="eraser-brush">
            <span>Pincel</span>
            <input
              type="range"
              min={12}
              max={160}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
            <em>{brushSize}px</em>
          </label>

          <label className="eraser-brush">
            <span>Força</span>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
            />
            <em>{strength}</em>
          </label>

          <label className="eraser-brush">
            <span>Textura</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sharpen}
              onChange={(e) => setSharpen(Number(e.target.value))}
            />
            <em>{sharpen}</em>
          </label>

          <ZoomToolbar
            zoom={zoom}
            onZoomIn={() => setZoom((z) => Math.min(8, z * 1.2))}
            onZoomOut={() => setZoom((z) => Math.max(0.25, z / 1.2))}
            onReset={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
          />

          <label className="mini-toggle">
            <input
              type="checkbox"
              checked={showMask}
              onChange={(e) => setShowMask(e.target.checked)}
            />
            <span>Mostrar máscara</span>
          </label>

          {detectedColor && (
            <div className="color-swatch" title="Cor média reconstituída">
              <span
                className="color-swatch-chip"
                style={{
                  background: `rgb(${detectedColor.r}, ${detectedColor.g}, ${detectedColor.b})`,
                }}
              />
              <em>
                Cor{' '}
                {`#${[detectedColor.r, detectedColor.g, detectedColor.b]
                  .map((v) => v.toString(16).padStart(2, '0'))
                  .join('')}`}
              </em>
            </div>
          )}

          <div className="eraser-actions">
            <BackButton onClick={onClose} />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleApply()}
              disabled={!ready || saving}
            >
              {saving ? 'Aplicando…' : 'Aplicar na área'}
            </button>
          </div>
        </div>

        <div
          className={`eraser-stage is-zoomable css-pan ${isPanning ? 'is-panning' : ''} ${dragging ? 'is-dragging' : ''}`}
          ref={stageRef}
          onWheel={onWheel}
          onPointerDown={onStagePointerDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!ready && <p className="eraser-loading">Carregando editor…</p>}
          {flash && <p className="dehaze-flash">{flash}</p>}

          <div
            ref={layerRef}
            className="dehaze-layer"
            style={{
              width: displayW || undefined,
              height: displayH || undefined,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <canvas
              ref={canvasRef}
              className={`eraser-canvas ${isPanning ? 'is-panning' : ''}`}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          {cursor && ready && !isPanning && (
            <span
              className={`eraser-cursor ${tool === 'erase' ? 'is-erase' : ''}`}
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
  )
}
