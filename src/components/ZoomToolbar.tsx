import { useI18n } from '../i18n'

interface ZoomToolbarProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function ZoomToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomToolbarProps) {
  const { m } = useI18n()
  return (
    <div className="zoom-toolbar" role="group" aria-label="Zoom">
      <button type="button" className="zoom-btn" onClick={onZoomOut} title={m.zoomOut}>
        −
      </button>
      <button
        type="button"
        className="zoom-btn zoom-label"
        onClick={onReset}
        title={m.zoomFit}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="zoom-btn" onClick={onZoomIn} title={m.zoomIn}>
        +
      </button>
    </div>
  )
}
