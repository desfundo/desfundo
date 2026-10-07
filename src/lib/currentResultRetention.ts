import type { ResultStore } from './resultStore'

/** IndexedDB kind for the current export/edit surface. */
export const CURRENT_RESULT_KIND = 'current' as const

/**
 * Idle policy (not tied to ImageCard mount/unmount — virtualization must not thrash):
 *
 * A COMPLETED result is IDLE when:
 * - it has a Blob in RAM
 * - it is not pin-protected (editor / download / zip / ensure)
 * - `now - resultTouchedAt >= CURRENT_RESULT_IDLE_MS` (45s after last real use)
 *
 * Under memory pressure (more than HOT_CAP in-RAM completed results),
 * candidates older than PRESSURE_IDLE_MS (8s) may also be evicted (oldest first),
 * still never while pinned.
 *
 * Newly completed / edited / hydrated results stay hot via resultTouchedAt = now.
 */
export const CURRENT_RESULT_IDLE_MS = 45_000
export const CURRENT_RESULT_PRESSURE_IDLE_MS = 8_000
export const CURRENT_RESULT_HOT_CAP = 16
export const CURRENT_RESULT_EVICT_INTERVAL_MS = 10_000

export function resultRefFor(imageId: string): string {
  return imageId
}

export async function persistCurrentResult(
  store: ResultStore,
  imageId: string,
  blob: Blob,
): Promise<string> {
  const ref = resultRefFor(imageId)
  await store.put(ref, CURRENT_RESULT_KIND, blob)
  return ref
}

export async function loadCurrentResult(
  store: ResultStore,
  ref: string | null | undefined,
): Promise<Blob | null> {
  if (!ref) return null
  return store.get(ref, CURRENT_RESULT_KIND)
}

export async function deleteCurrentResult(
  store: ResultStore,
  ref: string | null | undefined,
): Promise<void> {
  if (!ref) return
  await store.delete(ref, CURRENT_RESULT_KIND)
}

export async function deleteCurrentResults(
  store: ResultStore,
  refs: readonly (string | null | undefined)[],
): Promise<void> {
  for (const ref of refs) {
    await deleteCurrentResult(store, ref)
  }
}

export function createResultPinTable() {
  const pins = new Map<string, number>()

  return {
    acquire(id: string) {
      pins.set(id, (pins.get(id) ?? 0) + 1)
    },
    release(id: string) {
      const n = pins.get(id) ?? 0
      if (n <= 1) pins.delete(id)
      else pins.set(id, n - 1)
    },
    isPinned(id: string) {
      return (pins.get(id) ?? 0) > 0
    },
    clear() {
      pins.clear()
    },
  }
}

export type ResultPinTable = ReturnType<typeof createResultPinTable>

/** Deduplicate concurrent hydrations for the same id. */
export function createHydrationDedupe() {
  const inflight = new Map<string, Promise<Blob>>()

  return {
    run(id: string, loader: () => Promise<Blob>): Promise<Blob> {
      const existing = inflight.get(id)
      if (existing) return existing
      const promise = loader().finally(() => {
        inflight.delete(id)
      })
      inflight.set(id, promise)
      return promise
    },
    has(id: string) {
      return inflight.has(id)
    },
  }
}

export type HydrationDedupe = ReturnType<typeof createHydrationDedupe>

export interface EvictableResult {
  id: string
  resultBlob: Blob
  resultTouchedAt: number
}

/**
 * Pick idle in-RAM results for eviction. Does not touch storage.
 * Caller must persist then clear RAM only after success + re-check pins.
 */
export function selectIdleForEviction(
  items: readonly EvictableResult[],
  opts: {
    now: number
    isPinned: (id: string) => boolean
    idleMs?: number
    pressureIdleMs?: number
    hotCap?: number
  },
): EvictableResult[] {
  const idleMs = opts.idleMs ?? CURRENT_RESULT_IDLE_MS
  const pressureIdleMs =
    opts.pressureIdleMs ?? CURRENT_RESULT_PRESSURE_IDLE_MS
  const hotCap = opts.hotCap ?? CURRENT_RESULT_HOT_CAP

  const eligible = items
    .filter((i) => !opts.isPinned(i.id))
    .sort((a, b) => a.resultTouchedAt - b.resultTouchedAt)

  const out: EvictableResult[] = []
  const underPressure = eligible.length > hotCap

  for (const item of eligible) {
    const age = opts.now - item.resultTouchedAt
    if (age >= idleMs) {
      out.push(item)
      continue
    }
    if (underPressure && age >= pressureIdleMs) {
      // Evict oldest extras until at/under hot cap after this pass.
      const remainingHot = eligible.length - out.length
      if (remainingHot > hotCap) out.push(item)
    }
  }

  return out
}

/**
 * Safe eviction step: persist first; only then signal RAM release.
 * Returns ids that were successfully persisted and may drop resultBlob.
 */
export async function persistThenReleaseIds(
  store: ResultStore,
  candidates: readonly EvictableResult[],
  opts: {
    isPinned: (id: string) => boolean
    /** Re-read live blob; abort if changed or missing. */
    getLiveBlob: (id: string) => Blob | null | undefined
  },
): Promise<string[]> {
  const released: string[] = []

  for (const candidate of candidates) {
    if (opts.isPinned(candidate.id)) continue
    const live = opts.getLiveBlob(candidate.id)
    if (!live || live !== candidate.resultBlob) continue

    try {
      const ref = await persistCurrentResult(store, candidate.id, live)
      const ok = await store.has(ref, CURRENT_RESULT_KIND)
      if (!ok) continue
      if (opts.isPinned(candidate.id)) continue
      const still = opts.getLiveBlob(candidate.id)
      if (!still || still !== candidate.resultBlob) continue
      released.push(candidate.id)
    } catch {
      // Keep RAM — storage failure must not destroy the result.
    }
  }

  return released
}

export function hasCompletableResult(item: {
  status: string
  resultBlob: Blob | null
  resultRef: string | null
}): boolean {
  return (
    item.status === 'done' && (!!item.resultBlob || !!item.resultRef)
  )
}
