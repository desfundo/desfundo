/**
 * Throttles high-frequency progress callbacks into UI-friendly updates.
 * Leading + trailing so the first tick and the final value are visible.
 */
export function createProgressThrottler(
  intervalMs: number,
  onUpdate: (id: string, progress: number) => void,
) {
  let lastFlush = 0
  let pending: { id: string; progress: number } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    if (!pending) return
    const { id, progress } = pending
    pending = null
    lastFlush = Date.now()
    onUpdate(id, progress)
  }

  const push = (id: string, progress: number) => {
    pending = { id, progress }
    const now = Date.now()
    const elapsed = now - lastFlush
    if (elapsed >= intervalMs) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      flush()
      return
    }
    if (!timer) {
      timer = setTimeout(flush, intervalMs - elapsed)
    }
  }

  const flushNow = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    flush()
  }

  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pending = null
  }

  return { push, flushNow, cancel }
}

/** ~10 UI updates/sec — enough for a progress ring without remapping the gallery every ORT tick. */
export const PROGRESS_UI_INTERVAL_MS = 100
