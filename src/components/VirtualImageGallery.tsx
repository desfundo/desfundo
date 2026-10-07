import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { ImageSettings, ProcessedImage } from '../types'
import { ImageCard } from './ImageCard'

const MIN_CARD_WIDTH = 280
const GAP = 17.6 // 1.1rem
/** Closed card ≈ square preview + meta/actions; measureElement corrects after paint. */
const ESTIMATED_CARD_HEIGHT = 420
const OVERSCAN = 2

interface VirtualImageGalleryProps {
  images: ProcessedImage[]
  batchRunning: boolean
  onRemove: (id: string) => void
  onPatchSettings: (id: string, patch: Partial<ImageSettings>) => void
  onRestoreOriginal: (id: string) => void
  onReprocess: (id: string) => void
  onReapplyRetouch: (id: string) => void
  onOpenEraser: (id: string) => void
  onOpenDehaze: (id: string) => void
  onEnsureResult: (id: string) => Promise<Blob | null>
  onPinResult: (id: string) => void
  onUnpinResult: (id: string) => void
  onDownload: (image: ProcessedImage) => void
}

function useColumnCount(containerRef: RefObject<HTMLElement | null>) {
  const [cols, setCols] = useState(1)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const width = el.clientWidth
      const next = Math.max(
        1,
        Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)),
      )
      setCols(next)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  return cols
}

export function VirtualImageGallery({
  images,
  batchRunning,
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
}: VirtualImageGalleryProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const columns = useColumnCount(listRef)
  const rowCount = Math.max(0, Math.ceil(images.length / columns))
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0)
  }, [images.length, columns])

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [images.length, columns, scrollMargin, virtualizer])

  const virtualRows = virtualizer.getVirtualItems()

  const renderCard = useCallback(
    (image: ProcessedImage) => (
      <ImageCard
        key={image.id}
        image={image}
        batchRunning={batchRunning}
        onRemove={onRemove}
        onPatchSettings={onPatchSettings}
        onRestoreOriginal={onRestoreOriginal}
        onReprocess={onReprocess}
        onReapplyRetouch={onReapplyRetouch}
        onOpenEraser={onOpenEraser}
        onOpenDehaze={onOpenDehaze}
        onEnsureResult={onEnsureResult}
        onPinResult={onPinResult}
        onUnpinResult={onUnpinResult}
        onDownload={onDownload}
      />
    ),
    [
      batchRunning,
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
    ],
  )

  if (images.length === 0) return null

  return (
    <section
      className="gallery gallery-virtual"
      aria-label="Imagens"
      ref={listRef}
    >
      <div
        className="gallery-virtual-spacer"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((row) => {
          const start = row.index * columns
          const slice = images.slice(start, start + columns)
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="gallery-virtual-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start - scrollMargin}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GAP,
                alignItems: 'start',
              }}
            >
              {slice.map(renderCard)}
            </div>
          )
        })}
      </div>
    </section>
  )
}
