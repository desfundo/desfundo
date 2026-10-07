import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { ImageSettings, ProcessedImage } from '../types'
import { ImageCard } from './ImageCard'
import { useI18n } from '../i18n'

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

/**
 * `mounted` must flip when the gallery section appears: it renders null while
 * empty, so an effect that ran only once would never see the element and the
 * grid would stay stuck at 1 column.
 */
function useColumnCount(containerRef: RefObject<HTMLElement | null>, mounted: boolean) {
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
  }, [containerRef, mounted])

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
  const { m } = useI18n()
  const listRef = useRef<HTMLDivElement>(null)
  const hasImages = images.length > 0
  const columns = useColumnCount(listRef, hasImages)
  const rowCount = Math.max(0, Math.ceil(images.length / columns))
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    // The drop zone / PDF status above can change height; keep the margin current.
    const el = listRef.current
    if (!el) return
    const update = () => setScrollMargin(el.offsetTop)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [hasImages, columns])

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
    // Sizes are cached per key. Including the column count means a layout change
    // starts fresh, while adding images keeps the rows already measured.
    // (Calling virtualizer.measure() on every new batch wiped those sizes, and
    // mounted rows fell back to the 420px estimate and overlapped.)
    getItemKey: (index) => `${columns}:${index}`,
  })

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
      aria-label={m.galleryLabel}
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
                // Inside the measured box, so rows get the same gap as columns.
                paddingBottom: GAP,
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
