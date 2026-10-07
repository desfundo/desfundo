import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteBaseResult,
  deleteBaseResults,
  loadBaseResult,
  persistBaseResult,
} from '../lib/baseResultRetention'
import {
  createBatchScheduler,
  DEFAULT_BATCH_CONCURRENCY,
  type BatchScheduler,
} from '../lib/batchScheduler'
import {
  createHydrationDedupe,
  createResultPinTable,
  CURRENT_RESULT_EVICT_INTERVAL_MS,
  deleteCurrentResult,
  deleteCurrentResults,
  hasCompletableResult,
  loadCurrentResult,
  persistThenReleaseIds,
  resultRefFor,
  selectIdleForEviction,
} from '../lib/currentResultRetention'
import {
  autoRetouch,
  removeBackgroundFromFile,
  revokeUrl,
} from '../lib/imageProcessing'
import {
  createProgressThrottler,
  PROGRESS_UI_INTERVAL_MS,
} from '../lib/progressThrottle'
import {
  createResultStore,
  type ResultStore,
} from '../lib/resultStore'
import {
  createDefaultSettings,
  type ImageSettings,
  type ProcessedImage,
} from '../types'
import { getProductionEngine } from '../lib/backgroundRemoval/createEngine'
import { EngineStoppedError } from '../lib/backgroundRemoval/imglyEngine'
import { isPdfFile } from '../lib/pdfPages'
import { msg } from '../i18n'

/** Terminates the inference worker; the in-flight job rejects and the next one starts a fresh worker. */
function stopInference() {
  void getProductionEngine().dispose?.()
}

function confirmDiscardEdits(item: ProcessedImage | undefined): boolean {
  if (!item?.manuallyEdited) return true
  return window.confirm(msg().confirmDiscardEdits(item.name))
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const ACCEPT = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
])

const BATCH_CONCURRENCY = DEFAULT_BATCH_CONCURRENCY

function isAcceptedImage(file: File): boolean {
  return ACCEPT.has(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name)
}

export function useBatchProcessor() {
  const [images, setImages] = useState<ProcessedImage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [defaultAutoRetouch, setDefaultAutoRetouch] = useState(true)
  const [defaultRetouchStrength, setDefaultRetouchStrength] = useState(0.55)
  const [isExpandingPdf, setIsExpandingPdf] = useState(false)
  const [pdfStatus, setPdfStatus] = useState<string | null>(null)

  const imagesRef = useRef(images)
  imagesRef.current = images

  const storeRef = useRef<Promise<ResultStore> | null>(null)
  const getStore = useCallback(() => {
    if (!storeRef.current) {
      const opening = createResultStore()
      // Don't cache a failed open forever — the next call retries.
      opening.catch(() => {
        if (storeRef.current === opening) storeRef.current = null
      })
      storeRef.current = opening
    }
    return storeRef.current
  }, [])

  // The queue lives only in memory, so anything stored by a previous session is
  // unreachable. Clear it on startup, otherwise IndexedDB grows forever.
  useEffect(() => {
    void getStore()
      .then((store) => store.clear())
      .catch(() => {
        /* storage best-effort */
      })
  }, [getStore])

  /** Bumped by cancel/clear: in-flight jobs from an older epoch must not commit. */
  const epochRef = useRef(0)

  const pinsRef = useRef(createResultPinTable())
  const hydrateDedupeRef = useRef(createHydrationDedupe())

  const progressThrottleRef = useRef(
    createProgressThrottler(PROGRESS_UI_INTERVAL_MS, (id, progress) => {
      setImages((cur) =>
        cur.map((i) => (i.id === id ? { ...i, progress } : i)),
      )
    }),
  )

  const touchResult = useCallback((id: string) => {
    const now = Date.now()
    setImages((cur) =>
      cur.map((i) => (i.id === id ? { ...i, resultTouchedAt: now } : i)),
    )
  }, [])

  const pinResult = useCallback((id: string) => {
    pinsRef.current.acquire(id)
  }, [])

  const unpinResult = useCallback((id: string) => {
    pinsRef.current.release(id)
  }, [])

  const ensureResult = useCallback(
    async (id: string): Promise<Blob | null> => {
      const item = imagesRef.current.find((i) => i.id === id)
      if (!item) return null
      if (item.resultBlob) {
        touchResult(id)
        return item.resultBlob
      }
      if (!item.resultRef) return null

      return hydrateDedupeRef.current.run(id, async () => {
        const store = await getStore()
        const blob = await loadCurrentResult(store, item.resultRef)
        if (!blob) {
          throw new Error(msg().resultNotFound)
        }
        const now = Date.now()
        setImages((cur) =>
          cur.map((i) =>
            i.id === id
              ? { ...i, resultBlob: blob, resultTouchedAt: now }
              : i,
          ),
        )
        return blob
      })
    },
    [getStore, touchResult],
  )

  const evictIdleResults = useCallback(async () => {
    const inMemory = imagesRef.current
      .filter(
        (i): i is ProcessedImage & { resultBlob: Blob } =>
          i.status === 'done' && i.resultBlob != null,
      )
      .map((i) => ({
        id: i.id,
        resultBlob: i.resultBlob,
        resultTouchedAt: i.resultTouchedAt,
      }))

    if (inMemory.length === 0) return

    const candidates = selectIdleForEviction(inMemory, {
      now: Date.now(),
      isPinned: (id) => pinsRef.current.isPinned(id),
    })
    if (candidates.length === 0) return

    try {
      const store = await getStore()
      const released = await persistThenReleaseIds(store, candidates, {
        isPinned: (id) => pinsRef.current.isPinned(id),
        getLiveBlob: (id) =>
          imagesRef.current.find((i) => i.id === id)?.resultBlob,
      })
      if (released.length === 0) return

      const persisted = new Map(candidates.map((c) => [c.id, c.resultBlob]))
      const releasedSet = new Set(released)
      setImages((cur) =>
        cur.map((i) => {
          // Only drop the exact blob that was persisted — an edit saved in the
          // meantime must not be replaced by the stale stored copy.
          if (!releasedSet.has(i.id) || i.resultBlob !== persisted.get(i.id)) return i
          return {
            ...i,
            resultBlob: null,
            resultRef: resultRefFor(i.id),
          }
        }),
      )
    } catch {
      /* keep RAM */
    }
  }, [getStore])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void evictIdleResults()
    }, CURRENT_RESULT_EVICT_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [evictIdleResults])

  const invalidateStoredCurrent = useCallback(
    async (id: string) => {
      try {
        const store = await getStore()
        await deleteCurrentResult(store, id)
      } catch {
        /* best-effort */
      }
    },
    [getStore],
  )

  const runJob = useCallback(
    async (id: string) => {
      const item = imagesRef.current.find((i) => i.id === id)
      if (!item) return

      const epoch = epochRef.current
      const isStale = () =>
        epochRef.current !== epoch || !imagesRef.current.some((i) => i.id === id)
      const backToQueue = () => {
        progressThrottleRef.current.cancel()
        setImages((cur) =>
          cur.map((i) =>
            i.id === id ? { ...i, status: 'queued', progress: 0, error: undefined } : i,
          ),
        )
      }

      progressThrottleRef.current.cancel()
      pinResult(id)

      setImages((cur) =>
        cur.map((i) =>
          i.id === id
            ? { ...i, status: 'processing', progress: 0, error: undefined }
            : i,
        ),
      )

      try {
        const infer = () =>
          removeBackgroundFromFile(
            item.file,
            { autoRetouch: false, retouchStrength: 0.55 },
            (progress) => {
              progressThrottleRef.current.push(id, progress * 0.9)
            },
          )
        let raw: Blob
        try {
          raw = await infer()
        } catch (err) {
          // The engine was stopped for another image (removed right as this one
          // started): this job is still wanted, so run it again once.
          if (err instanceof EngineStoppedError && !isStale()) raw = await infer()
          else throw err
        }

        if (isStale()) return backToQueue()
        progressThrottleRef.current.flushNow()

        const latest = imagesRef.current.find((i) => i.id === id)
        const settings = latest?.settings ?? item.settings

        let result = raw
        if (settings.autoRetouch) {
          result = await autoRetouch(raw, settings.retouchStrength)
        }

        // A storage failure must not throw away a good cutout: keep it in RAM,
        // only "reaplicar retoque" (which needs the stored base) is lost.
        let baseResultRef: string | null = null
        try {
          const store = await getStore()
          if (isStale()) return backToQueue()
          baseResultRef = await persistBaseResult(store, id, raw)
          // Replace any previous stored current (retry / reprocess).
          await deleteCurrentResult(store, id)
        } catch {
          baseResultRef = null
        }
        if (isStale()) {
          if (baseResultRef) void getStore().then((s) => deleteBaseResult(s, baseResultRef))
          return backToQueue()
        }

        const now = Date.now()
        setImages((cur) =>
          cur.map((i) => {
            if (i.id !== id) return i
            revokeUrl(i.resultUrl)
            return {
              ...i,
              status: 'done',
              progress: 1,
              resultBlob: result,
              resultRef: null,
              resultTouchedAt: now,
              baseResultRef,
              resultUrl: null,
              manuallyEdited: false,
            }
          }),
        )
        void evictIdleResults()
      } catch (err) {
        // Cancelled / removed mid-inference: the engine was stopped on purpose.
        if (isStale()) return backToQueue()
        progressThrottleRef.current.cancel()
        const message = err instanceof Error ? err.message : msg().processFailed
        setImages((cur) =>
          cur.map((i) =>
            i.id === id
              ? { ...i, status: 'error', error: message, progress: 0 }
              : i,
          ),
        )
        throw err instanceof Error ? err : new Error(message)
      } finally {
        unpinResult(id)
      }
    },
    [evictIdleResults, getStore, pinResult, unpinResult],
  )

  const runJobRef = useRef(runJob)
  runJobRef.current = runJob

  const schedulerRef = useRef<BatchScheduler | null>(null)
  if (!schedulerRef.current) {
    schedulerRef.current = createBatchScheduler({
      concurrency: BATCH_CONCURRENCY,
      process: (id) => runJobRef.current(id),
      onStateChange: (state) => {
        setIsProcessing(state.running || state.activeIds.length > 0)
      },
    })
  }

  const enqueueImages = useCallback(
    (list: File[]) => {
      if (list.length === 0) return
      const next: ProcessedImage[] = list.map((file) => ({
        id: uid(),
        file,
        name: file.name,
        originalUrl: null,
        resultUrl: null,
        resultBlob: null,
        resultRef: null,
        resultTouchedAt: 0,
        baseResultRef: null,
        status: 'queued',
        progress: 0,
        settings: createDefaultSettings({
          autoRetouch: defaultAutoRetouch,
          retouchStrength: defaultRetouchStrength,
        }),
      }))
      setImages((prev) => [...prev, ...next])
    },
    [defaultAutoRetouch, defaultRetouchStrength],
  )

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files)
      const imagesOnly = incoming.filter(isAcceptedImage)
      const pdfs = incoming.filter(isPdfFile)
      enqueueImages(imagesOnly)
      if (pdfs.length === 0) {
        if (imagesOnly.length === 0) {
          setPdfStatus(msg().nothingRecognized)
        }
        return
      }

      void (async () => {
        setIsExpandingPdf(true)
        try {
          // pdf.js is large; load it only when a PDF actually arrives.
          const { pdfToPageFiles } = await import('../lib/pdfExpand')
          for (const pdf of pdfs) {
            setPdfStatus(msg().pdfReading(pdf.name))
            const pages = await pdfToPageFiles(pdf, (page, total) => {
              setPdfStatus(msg().pdfReadingPage(pdf.name, page, total))
            })
            enqueueImages(pages)
            setPdfStatus(msg().pdfQueued(pdf.name, pages.length))
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : msg().pdfFailed
          setPdfStatus(message)
        } finally {
          setIsExpandingPdf(false)
        }
      })()
    },
    [enqueueImages],
  )

  const removeImage = useCallback(
    (id: string) => {
      const target = imagesRef.current.find((i) => i.id === id)
      // Removing the image being processed: stop its inference right away.
      if (target?.status === 'processing') stopInference()
      void (async () => {
        try {
          const store = await getStore()
          await deleteBaseResult(store, target?.baseResultRef ?? id)
          await deleteCurrentResult(store, target?.resultRef ?? id)
        } catch {
          /* storage best-effort */
        }
      })()

      setImages((prev) => {
        const item = prev.find((i) => i.id === id)
        if (item) {
          revokeUrl(item.originalUrl)
          revokeUrl(item.resultUrl)
        }
        return prev.filter((i) => i.id !== id)
      })
    },
    [getStore],
  )

  const clearAll = useCallback(() => {
    epochRef.current += 1
    schedulerRef.current?.cancel()
    stopInference()
    progressThrottleRef.current.cancel()
    pinsRef.current.clear()
    setIsProcessing(false)

    const baseRefs = imagesRef.current.map((i) => i.baseResultRef ?? i.id)
    const currentRefs = imagesRef.current.map((i) => i.resultRef ?? i.id)
    void (async () => {
      try {
        const store = await getStore()
        await deleteBaseResults(store, baseRefs)
        await deleteCurrentResults(store, currentRefs)
      } catch {
        /* storage best-effort */
      }
    })()

    setImages((prev) => {
      prev.forEach((i) => {
        revokeUrl(i.originalUrl)
        revokeUrl(i.resultUrl)
      })
      return []
    })
  }, [getStore])

  const patchSettings = useCallback(
    (id: string, patch: Partial<ImageSettings>) => {
      setImages((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, settings: { ...i.settings, ...patch } } : i,
        ),
      )
    },
    [],
  )

  const updateResult = useCallback(
    (id: string, blob: Blob) => {
      const now = Date.now()
      void invalidateStoredCurrent(id)
      setImages((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i
          revokeUrl(i.resultUrl)
          return {
            ...i,
            resultBlob: blob,
            resultRef: null,
            resultTouchedAt: now,
            resultUrl: null,
            manuallyEdited: true,
          }
        }),
      )
    },
    [invalidateStoredCurrent],
  )

  const restoreOriginal = useCallback(
    (id: string) => {
      const item = imagesRef.current.find((i) => i.id === id)
      if (!item) return
      const now = Date.now()
      void invalidateStoredCurrent(id)
      setImages((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i
          revokeUrl(i.resultUrl)
          return {
            ...i,
            status: 'done',
            progress: 1,
            error: undefined,
            resultBlob: item.file,
            resultRef: null,
            resultTouchedAt: now,
            resultUrl: null,
            manuallyEdited: false,
          }
        }),
      )
    },
    [invalidateStoredCurrent],
  )

  const processAll = useCallback(async () => {
    const scheduler = schedulerRef.current
    if (!scheduler) return

    const ids = imagesRef.current
      .filter((item) => !hasCompletableResult(item))
      .map((item) => item.id)

    scheduler.enqueue(ids)
    await scheduler.start()
  }, [])

  const reprocess = useCallback(async (id: string) => {
    const scheduler = schedulerRef.current
    if (!scheduler) return
    if (!confirmDiscardEdits(imagesRef.current.find((i) => i.id === id))) return
    scheduler.enqueuePriority(id)
    await scheduler.start()
  }, [])

  const reapplyRetouch = useCallback(
    async (id: string) => {
      const item = imagesRef.current.find((i) => i.id === id)
      if (!item?.baseResultRef) return
      if (!confirmDiscardEdits(item)) return

      pinResult(id)
      setImages((cur) =>
        cur.map((i) =>
          i.id === id ? { ...i, status: 'processing', progress: 0.5 } : i,
        ),
      )

      try {
        const store = await getStore()
        const base = await loadBaseResult(store, item.baseResultRef)
        if (!base) {
          throw new Error(msg().retouchBaseNotFound)
        }

        const latest = imagesRef.current.find((i) => i.id === id) ?? item
        let result = base
        if (latest.settings.autoRetouch) {
          result = await autoRetouch(base, latest.settings.retouchStrength)
        }

        await deleteCurrentResult(store, id)
        const now = Date.now()
        setImages((cur) =>
          cur.map((i) => {
            if (i.id !== id) return i
            revokeUrl(i.resultUrl)
            return {
              ...i,
              status: 'done',
              progress: 1,
              resultBlob: result,
              resultRef: null,
              resultTouchedAt: now,
              resultUrl: null,
              manuallyEdited: false,
            }
          }),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : msg().retouchFailed
        setImages((cur) =>
          cur.map((i) =>
            i.id === id ? { ...i, status: 'error', error: message } : i,
          ),
        )
      } finally {
        unpinResult(id)
      }
    },
    [getStore, pinResult, unpinResult],
  )

  const applyDefaultsToAll = useCallback(() => {
    setImages((prev) =>
      prev.map((i) => ({
        ...i,
        settings: {
          ...i.settings,
          autoRetouch: defaultAutoRetouch,
          retouchStrength: defaultRetouchStrength,
        },
      })),
    )
  }, [defaultAutoRetouch, defaultRetouchStrength])

  const cancel = useCallback(() => {
    epochRef.current += 1
    progressThrottleRef.current.cancel()
    schedulerRef.current?.cancel()
    // Stop the image in progress too (it goes back to "Na fila"); done ones stay.
    stopInference()
  }, [])

  const doneCount = images.filter((i) => i.status === 'done').length
  const errorCount = images.filter((i) => i.status === 'error').length

  return {
    images,
    isProcessing,
    isExpandingPdf,
    pdfStatus,
    defaultAutoRetouch,
    setDefaultAutoRetouch,
    defaultRetouchStrength,
    setDefaultRetouchStrength,
    addFiles,
    removeImage,
    clearAll,
    patchSettings,
    updateResult,
    restoreOriginal,
    processAll,
    reprocess,
    reapplyRetouch,
    applyDefaultsToAll,
    cancel,
    doneCount,
    errorCount,
    ensureResult,
    pinResult,
    unpinResult,
  }
}
