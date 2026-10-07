import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { usePreviewUrl } from '../hooks/usePreviewUrl'
import type { FillBackground, ImageSettings, ProcessedImage } from '../types'
import { previewFilter, previewTransform } from '../lib/imageProcessing'
import { ZoomToolbar } from './ZoomToolbar'

interface ImageCardProps {
  image: ProcessedImage
  /** True while the global batch queue is running — must NOT block COMPLETED item actions. */
  batchRunning?: boolean
  onRemove: (id: string) => void
  onPatchSettings: (id: string, patch: Partial<ImageSettings>) => void
  onRestoreOriginal: (id: string) => void
  onReprocess: (id: string) => void
  onReapplyRetouch: (id: string) => void
  /** Editors are hosted by App so virtualization can unmount cards safely. */
  onOpenEraser: (id: string) => void
  onOpenDehaze: (id: string) => void
  /** Hydrate STORED current result for preview/download (not scroll-eviction). */
  onEnsureResult: (id: string) => Promise<Blob | null>
  /** Keeps an on-screen result in RAM (bounded by the virtualized viewport). */
  onPinResult: (id: string) => void
  onUnpinResult: (id: string) => void
  onDownload: (image: ProcessedImage) => void
}

const PRESETS = [-90, 0, 90, 180] as const
const BACKGROUNDS: { id: FillBackground; label: string }[] = [
  { id: 'transparent', label: 'Transp.' },
  { id: 'white', label: 'Branco' },
  { id: 'black', label: 'Preto' },
]

export function ImageCard({
  image,
  batchRunning = false,
  onRemove,
  onPatchSettings,
  onRestoreOriginal,
  onReprocess,
  onReapplyRetouch,
  onOpenEraser,
  onOpenDehaze,
  onEnsureResult,
  onPinResult,
  onUnpinResult,
  onDownload,
}: ImageCardProps) {
  const [open, setOpen] = useState(false)
  const [viewZoom, setViewZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const panningRef = useRef(false)
  const panLastRef = useRef<{ x: number; y: number } | null>(null)
  // Prefer current result; fall back to original File only when not yet done.
  const previewSource =
    image.resultBlob ?? (image.status === 'done' ? null : image.file)
  const preview = usePreviewUrl(previewSource)
  const isDone = image.status === 'done'
  const itemProcessing = image.status === 'processing'
  const { settings } = image

  useEffect(() => {
    if (image.status !== 'done') return
    if (image.resultBlob || !image.resultRef) return
    void onEnsureResult(image.id)
  }, [image.id, image.status, image.resultBlob, image.resultRef, onEnsureResult])

  // Without this, idle eviction drops on-screen results every ~45s and the
  // effect above reloads them: flicker plus a full PNG rewrite each cycle.
  useEffect(() => {
    if (!isDone) return
    onPinResult(image.id)
    return () => onUnpinResult(image.id)
  }, [image.id, isDone, onPinResult, onUnpinResult])

  const patch = (partial: Partial<ImageSettings>) =>
    onPatchSettings(image.id, partial)

  const resetView = useCallback(() => {
    setViewZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const sync = (e: KeyboardEvent) => setCtrlHeld(e.ctrlKey || e.metaKey)
    const blur = () => setCtrlHeld(false)
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const onPreviewWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    e.stopPropagation()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    setViewZoom((z) => Math.max(1, Math.min(6, z * factor)))
  }

  const onPreviewPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    panningRef.current = true
    panLastRef.current = { x: e.clientX, y: e.clientY }
  }

  const onPreviewPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!panningRef.current || !panLastRef.current) return
    const dx = e.clientX - panLastRef.current.x
    const dy = e.clientY - panLastRef.current.y
    panLastRef.current = { x: e.clientX, y: e.clientY }
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
  }

  const onPreviewPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    panningRef.current = false
    panLastRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <article className={`image-card status-${image.status}`}>
        <div
          className={`image-card-preview bg-${settings.background} ${viewZoom > 1.01 ? 'is-zoomed' : ''} ${ctrlHeld ? 'is-panning' : ''}`}
          onWheel={onPreviewWheel}
          onPointerDown={onPreviewPointerDown}
          onPointerMove={onPreviewPointerMove}
          onPointerUp={onPreviewPointerUp}
          onPointerLeave={onPreviewPointerUp}
          onDoubleClick={resetView}
        >
          <div className="checker" aria-hidden />
          <img
            className="image-card-photo"
            src={preview ?? undefined}
            alt={image.name}
            draggable={false}
            style={{
              transform: previewTransform(settings, viewZoom, pan.x, pan.y),
              filter: isDone ? previewFilter(settings) : undefined,
            }}
          />

          <div className="card-zoom-bar">
            <ZoomToolbar
              zoom={viewZoom}
              onZoomIn={() => setViewZoom((z) => Math.min(6, z * 1.25))}
              onZoomOut={() => {
                setViewZoom((z) => {
                  const next = Math.max(1, z / 1.25)
                  if (next <= 1.01) setPan({ x: 0, y: 0 })
                  return next
                })
              }}
              onReset={resetView}
            />
          </div>

          {image.status === 'processing' && (
            <div className="image-card-overlay">
              <div className="ring" style={{ ['--p' as string]: image.progress }}>
                <span>{Math.round(image.progress * 100)}%</span>
              </div>
            </div>
          )}

          {image.status === 'queued' && (
            <div className="image-card-badge">Na fila</div>
          )}
          {image.status === 'error' && (
            <div className="image-card-badge is-error">Erro</div>
          )}
          {image.status === 'done' && (
            <div className="image-card-badge is-done">Pronto</div>
          )}
        </div>

        <div className="image-card-body">
          <div className="image-card-meta">
            <h3 title={image.name}>{image.name}</h3>
            {image.error && <p className="image-error">{image.error}</p>}
          </div>

          <div className="per-image-retouch">
            <label className="mini-toggle">
              <input
                type="checkbox"
                checked={settings.autoRetouch}
                disabled={itemProcessing}
                onChange={(e) => patch({ autoRetouch: e.target.checked })}
              />
              <span>Retoque automático</span>
            </label>
            {settings.autoRetouch && (
              <label className="mini-slider">
                <span>Intensidade</span>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={settings.retouchStrength}
                  disabled={itemProcessing}
                  onChange={(e) =>
                    patch({ retouchStrength: Number(e.target.value) })
                  }
                />
                <em>{Math.round(settings.retouchStrength * 100)}%</em>
              </label>
            )}
            {isDone && image.baseResultRef && (
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => void onReapplyRetouch(image.id)}
                title="Aplicar retoque atual no resultado (sem nova remoção de fundo)"
              >
                Reaplicar retoque
              </button>
            )}
          </div>

          {isDone && (
            <>
              <button
                type="button"
                className={`adjust-toggle ${open ? 'is-open' : ''}`}
                onClick={() => setOpen((v) => !v)}
              >
                Ajustes da imagem
                <span aria-hidden>{open ? '−' : '+'}</span>
              </button>

              {open && (
                <div className="adjust-panel">
                  <div className="adjust-block">
                    <span className="rotation-label">Rotação</span>
                    <div className="rotation-presets">
                      {PRESETS.map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          className={settings.rotation === deg ? 'is-active' : ''}
                          onClick={() => patch({ rotation: deg })}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                    <label className="rotation-slider">
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={settings.rotation}
                        onChange={(e) =>
                          patch({ rotation: Number(e.target.value) })
                        }
                      />
                      <span>
                        {settings.rotation > 0 ? '+' : ''}
                        {settings.rotation}°
                      </span>
                    </label>
                  </div>

                  <div className="adjust-block">
                    <span className="rotation-label">Espelhar</span>
                    <div className="chip-row">
                      <button
                        type="button"
                        className={settings.flipH ? 'is-active' : ''}
                        onClick={() => patch({ flipH: !settings.flipH })}
                      >
                        Horizontal
                      </button>
                      <button
                        type="button"
                        className={settings.flipV ? 'is-active' : ''}
                        onClick={() => patch({ flipV: !settings.flipV })}
                      >
                        Vertical
                      </button>
                    </div>
                  </div>

                  <div className="adjust-block">
                    <label className="mini-slider">
                      <span>Brilho</span>
                      <input
                        type="range"
                        min={-40}
                        max={40}
                        value={settings.brightness}
                        onChange={(e) =>
                          patch({ brightness: Number(e.target.value) })
                        }
                      />
                      <em>{settings.brightness}</em>
                    </label>
                    <label className="mini-slider">
                      <span>Contraste</span>
                      <input
                        type="range"
                        min={-40}
                        max={40}
                        value={settings.contrast}
                        onChange={(e) =>
                          patch({ contrast: Number(e.target.value) })
                        }
                      />
                      <em>{settings.contrast}</em>
                    </label>
                    <label className="mini-slider" title="Tamanho no arquivo baixado (não é zoom da prévia)">
                      <span>Tam. export</span>
                      <input
                        type="range"
                        min={0.5}
                        max={1.5}
                        step={0.05}
                        value={settings.scale}
                        onChange={(e) =>
                          patch({ scale: Number(e.target.value) })
                        }
                      />
                      <em>{Math.round(settings.scale * 100)}%</em>
                    </label>
                    <label className="mini-slider" title="Intensidade do anti-reflexo na área pintada">
                      <span>Anti-reflexo</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={settings.dehaze || 55}
                        onChange={(e) =>
                          patch({ dehaze: Number(e.target.value) })
                        }
                      />
                      <em>{settings.dehaze || 55}</em>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => onOpenDehaze(image.id)}
                    >
                      Selecionar área
                    </button>
                    <p className="adjust-hint">
                      Pinte só a região com plástico/reflexo e aplique o efeito.
                    </p>
                  </div>

                  <div className="adjust-block">
                    <label className="mini-toggle">
                      <input
                        type="checkbox"
                        checked={settings.trimTransparent}
                        onChange={(e) =>
                          patch({ trimTransparent: e.target.checked })
                        }
                      />
                      <span>Recortar áreas vazias</span>
                    </label>
                    <label className="mini-slider">
                      <span>Margem</span>
                      <input
                        type="range"
                        min={0}
                        max={80}
                        step={2}
                        value={settings.padding}
                        onChange={(e) =>
                          patch({ padding: Number(e.target.value) })
                        }
                      />
                      <em>{settings.padding}px</em>
                    </label>
                  </div>

                  <div className="adjust-block">
                    <span className="rotation-label">Fundo na exportação</span>
                    <div className="chip-row">
                      {BACKGROUNDS.map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          className={
                            settings.background === bg.id ? 'is-active' : ''
                          }
                          onClick={() => patch({ background: bg.id })}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() =>
                      patch({
                        rotation: 0,
                        flipH: false,
                        flipV: false,
                        brightness: 0,
                        contrast: 0,
                        scale: 1,
                        dehaze: 55,
                        trimTransparent: false,
                        padding: 0,
                        background: 'transparent',
                      })
                    }
                  >
                    Resetar ajustes
                  </button>
                </div>
              )}
            </>
          )}

          <div className="image-card-actions">
            {isDone && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onOpenEraser(image.id)}
                  title="Remover ou restaurar partes da imagem"
                >
                  Borracha
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onRestoreOriginal(image.id)}
                  title="Restaura a foto enviada, sem remoção de fundo"
                >
                  Original
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void onReprocess(image.id)}
                  title="Rodar remoção de fundo de novo"
                >
                  Reprocessar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onDownload(image)}
                  title="Baixar PNG desta imagem agora"
                >
                  Baixar
                </button>
              </>
            )}
            {(image.status === 'queued' || image.status === 'error') && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={batchRunning || itemProcessing}
                onClick={() => void onReprocess(image.id)}
                title={
                  batchRunning
                    ? 'Aguarde a fila ou cancele para processar esta imagem à parte'
                    : undefined
                }
              >
                Processar
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost is-danger"
              disabled={itemProcessing}
              onClick={() => onRemove(image.id)}
              title={
                itemProcessing
                  ? 'Não é possível remover enquanto esta imagem processa'
                  : undefined
              }
            >
              Remover
            </button>
          </div>
        </div>
      </article>
    </>
  )
}
