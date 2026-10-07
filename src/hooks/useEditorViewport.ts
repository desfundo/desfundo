import { useCallback, useRef, useState, type RefObject, type WheelEvent } from 'react'

export interface ViewportState {
  /** Multiplicador sobre o enquadramento “caber na tela”. */
  zoom: number
  panX: number
  panY: number
}

export function useEditorViewport() {
  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const ctrlRef = useRef(false)
  const panningRef = useRef(false)
  const panLastRef = useRef<{ x: number; y: number } | null>(null)

  const resetView = useCallback(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 })
  }, [])

  const setZoom = useCallback((zoom: number) => {
    setViewport((v) => ({
      ...v,
      zoom: Math.max(0.25, Math.min(8, zoom)),
    }))
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setViewport((v) => ({
      ...v,
      zoom: Math.max(0.25, Math.min(8, v.zoom * factor)),
    }))
  }, [])

  const onWheelZoom = useCallback(
    (e: WheelEvent, wrap: HTMLElement | null) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const mx = e.clientX - rect.left - rect.width / 2
      const my = e.clientY - rect.top - rect.height / 2
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12

      setViewport((v) => {
        const next = Math.max(0.25, Math.min(8, v.zoom * factor))
        const ratio = next / v.zoom
        return {
          zoom: next,
          panX: mx - (mx - v.panX) * ratio,
          panY: my - (my - v.panY) * ratio,
        }
      })
    },
    [],
  )

  const beginPan = useCallback((clientX: number, clientY: number) => {
    panningRef.current = true
    panLastRef.current = { x: clientX, y: clientY }
  }, [])

  const movePan = useCallback((clientX: number, clientY: number) => {
    if (!panningRef.current || !panLastRef.current) return false
    const dx = clientX - panLastRef.current.x
    const dy = clientY - panLastRef.current.y
    panLastRef.current = { x: clientX, y: clientY }
    setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }))
    return true
  }, [])

  const endPan = useCallback(() => {
    panningRef.current = false
    panLastRef.current = null
  }, [])

  const bindModifierKeys = useCallback(() => {
    const setCtrl = (down: boolean) => {
      if (ctrlRef.current === down) {
        if (!down) endPan()
        return
      }
      ctrlRef.current = down
      setCtrlHeld(down)
      if (!down) endPan()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrl(true)
      else if (e.ctrlKey || e.metaKey) setCtrl(true)
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
    // Ponteiro é a fonte da verdade — evita Ctrl “preso” após arrastar
    const onPointer = (e: PointerEvent) => {
      setCtrl(e.ctrlKey || e.metaKey)
    }
    const clear = () => setCtrl(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerup', onPointer)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerup', onPointer)
      window.removeEventListener('blur', clear)
    }
  }, [endPan])

  return {
    viewport,
    ctrlRef,
    ctrlHeld,
    panningRef,
    resetView,
    setZoom,
    zoomBy,
    onWheelZoom,
    beginPan,
    movePan,
    endPan,
    bindModifierKeys,
  }
}

/** Escala base para caber no container (pode ser > 1 se a imagem for menor). */
export function fitScale(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
) {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return 1
  return Math.min(boxW / imgW, boxH / imgH)
}

export function viewMetrics(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  viewport: ViewportState,
) {
  const fit = fitScale(imgW, imgH, boxW, boxH)
  const scale = fit * viewport.zoom
  const drawW = imgW * scale
  const drawH = imgH * scale
  const x = (boxW - drawW) / 2 + viewport.panX
  const y = (boxH - drawH) / 2 + viewport.panY
  return { fit, scale, drawW, drawH, x, y }
}

export function clientToImage(
  clientX: number,
  clientY: number,
  canvasEl: HTMLCanvasElement,
  imgW: number,
  imgH: number,
  viewport: ViewportState,
) {
  const rect = canvasEl.getBoundingClientRect()
  const boxW = canvasEl.width
  const boxH = canvasEl.height
  const localX = ((clientX - rect.left) / rect.width) * boxW
  const localY = ((clientY - rect.top) / rect.height) * boxH
  const { scale, x, y } = viewMetrics(imgW, imgH, boxW, boxH, viewport)
  return {
    x: (localX - x) / scale,
    y: (localY - y) / scale,
  }
}

export type ViewportControlsProps = {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  wrapRef?: RefObject<HTMLDivElement | null>
}
