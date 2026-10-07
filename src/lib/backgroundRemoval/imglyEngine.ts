import type {
  BackgroundRemovalEngine,
  RemovalProgress,
} from './types'
import { validateInputBlob } from './preprocess'
import { assertPngBlob } from './postprocess'
import type { WorkerRequest, WorkerResponse } from './imgly.worker'

/** Model + ONNX runtime are bundled under public/imgly/ (npm run imgly:data) — no CDN at runtime. */
function localPublicPath(): string {
  return new URL('imgly/', globalThis.document?.baseURI ?? globalThis.location?.href).href
}

/** Rejection for jobs that were in flight when the engine was stopped (cancel / remove). */
export class EngineStoppedError extends Error {
  constructor() {
    super('Motor encerrado')
    this.name = 'EngineStoppedError'
  }
}

type Job = {
  resolve: (blob: Blob) => void
  reject: (error: Error) => void
  onProgress?: RemovalProgress
}

/**
 * Production adapter — wraps `@imgly/background-removal`.
 * Inference runs in a dedicated Web Worker so the UI never freezes.
 */
export function createImglyEngine(): BackgroundRemovalEngine {
  let worker: Worker | null = null
  let nextId = 1
  const jobs = new Map<number, Job>()

  function failAll(error: Error) {
    for (const job of jobs.values()) job.reject(error)
    jobs.clear()
    worker?.terminate()
    worker = null
  }

  function getWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('./imgly.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const job = jobs.get(msg.id)
      if (!job) return
      if (msg.type === 'progress') {
        job.onProgress?.(0.05 + msg.value * 0.9)
        return
      }
      jobs.delete(msg.id)
      if (msg.type === 'done') job.resolve(msg.blob)
      else job.reject(new Error(msg.message))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      failAll(new Error(event.message || 'Falha no worker de remoção de fundo'))
    }
    return worker
  }

  return {
    id: 'imgly',
    label: '@imgly/background-removal',

    async initialize() {
      getWorker()
    },

    async removeBackground(input, options) {
      validateInputBlob(input)
      options?.onProgress?.(0.05)

      const result = await new Promise<Blob>((resolve, reject) => {
        const id = nextId++
        jobs.set(id, { resolve, reject, onProgress: options?.onProgress })
        const request: WorkerRequest = { id, input, publicPath: localPublicPath() }
        getWorker().postMessage(request)
      })

      assertPngBlob(result)
      options?.onProgress?.(1)
      return result
    },

    async dispose() {
      failAll(new EngineStoppedError())
    },
  }
}
