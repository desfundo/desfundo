/**
 * Batch queue scheduler — UI-agnostic.
 * Phase 5: concurrency is locked to 1 (sequential). The concurrency option
 * exists so future phases can raise it without rewriting callers.
 */

export const DEFAULT_BATCH_CONCURRENCY = 1 as const

export interface BatchSchedulerState {
  concurrency: number
  /** True while a drain loop is active (including waiting on the current job). */
  running: boolean
  /** Soft-cancel: do not start further queued jobs. */
  cancelled: boolean
  activeIds: readonly string[]
  queuedIds: readonly string[]
}

export interface BatchSchedulerOptions {
  /**
   * Max simultaneous jobs. This phase uses `1` only.
   * Values > 1 are accepted by the API but must not be used until engine work allows it.
   */
  concurrency?: number
  /** Run one job. Throw to mark failure; the scheduler isolates errors and continues. */
  process: (id: string) => Promise<void>
  onStateChange?: (state: BatchSchedulerState) => void
}

export interface BatchScheduler {
  readonly concurrency: number
  /** Append ids (skip duplicates already queued or active). */
  enqueue(ids: readonly string[]): void
  /** Move id to the front of the queue (retry / reprocess). */
  enqueuePriority(id: string): void
  /** Drain the queue until empty or cancelled. Safe to call while already running. */
  start(): Promise<void>
  /**
   * Cancel queue: stop starting new jobs; clear pending queue.
   * In-flight job is allowed to finish. Does not touch completed results.
   */
  cancel(): void
  /** Drop pending ids only (active job unaffected). */
  clearQueue(): void
  getState(): BatchSchedulerState
  isRunning(): boolean
}

export function createBatchScheduler(
  options: BatchSchedulerOptions,
): BatchScheduler {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_BATCH_CONCURRENCY)
  const { process, onStateChange } = options

  const queue: string[] = []
  const queuedSet = new Set<string>()
  const active = new Set<string>()

  let cancelled = false
  let drainPromise: Promise<void> | null = null

  const getState = (): BatchSchedulerState => ({
    concurrency,
    running: drainPromise !== null,
    cancelled,
    activeIds: [...active],
    queuedIds: [...queue],
  })

  const emit = () => {
    onStateChange?.(getState())
  }

  const removeFromQueue = (id: string) => {
    if (!queuedSet.has(id)) return
    queuedSet.delete(id)
    const idx = queue.indexOf(id)
    if (idx >= 0) queue.splice(idx, 1)
  }

  const enqueue = (ids: readonly string[]) => {
    for (const id of ids) {
      if (active.has(id) || queuedSet.has(id)) continue
      queue.push(id)
      queuedSet.add(id)
    }
    emit()
  }

  const enqueuePriority = (id: string) => {
    if (active.has(id)) return
    removeFromQueue(id)
    queue.unshift(id)
    queuedSet.add(id)
    emit()
  }

  const clearQueue = () => {
    queue.length = 0
    queuedSet.clear()
    emit()
  }

  const cancel = () => {
    cancelled = true
    clearQueue()
    emit()
  }

  const takeNext = (): string | undefined => {
    const id = queue.shift()
    if (id !== undefined) queuedSet.delete(id)
    return id
  }

  const runJob = async (id: string) => {
    active.add(id)
    emit()
    try {
      await process(id)
    } catch {
      // Error isolation: one failure must not stop the drain loop.
    } finally {
      active.delete(id)
      emit()
    }
  }

  const drain = async () => {
    try {
      const workers = Array.from({ length: concurrency }, async () => {
        while (!cancelled) {
          const id = takeNext()
          if (id === undefined) return
          await runJob(id)
        }
      })
      await Promise.all(workers)
    } finally {
      drainPromise = null
      emit()
      // Jobs enqueued while the last worker was exiting.
      if (!cancelled && queue.length > 0) {
        void start()
      }
    }
  }

  const start = (): Promise<void> => {
    cancelled = false
    if (drainPromise) {
      emit()
      return drainPromise
    }
    if (queue.length === 0) {
      emit()
      return Promise.resolve()
    }
    drainPromise = drain()
    emit()
    return drainPromise
  }

  return {
    concurrency,
    enqueue,
    enqueuePriority,
    start,
    cancel,
    clearQueue,
    getState,
    isRunning: () => drainPromise !== null,
  }
}
