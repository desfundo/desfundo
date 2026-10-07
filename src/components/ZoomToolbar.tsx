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
  return (
    <div className="zoom-toolbar" role="group" aria-label="Zoom">
      <button type="button" className="zoom-btn" onClick={onZoomOut} title="Diminuir">
        −
      </button>
      <button
        type="button"
        className="zoom-btn zoom-label"
        onClick={onReset}
        title="Ajustar à tela"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="zoom-btn" onClick={onZoomIn} title="Aumentar">
        +
      </button>
    </div>
  )
}
