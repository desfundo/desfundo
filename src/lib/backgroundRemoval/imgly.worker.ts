/// <reference lib="webworker" />
import { removeBackground, type Config } from '@imgly/background-removal'

/**
 * Runs IMG.LY inference off the UI thread. IMG.LY only proxies to its own worker
 * on WebGPU, so on CPU the whole call has to live here to keep the UI responsive.
 */

export type WorkerRequest = { id: number; input: Blob; publicPath: string }
export type WorkerResponse =
  | { id: number; type: 'progress'; value: number }
  | { id: number; type: 'done'; blob: Blob }
  | { id: number; type: 'error'; message: string }

let currentId = 0

// IMG.LY memoizes its config (including `progress`) by JSON key, so the first
// callback is reused for every later image. Keep one stable callback that reports
// for whichever job is running now.
const progress: Config['progress'] = (_key, current, total) => {
  if (total > 0) post({ id: currentId, type: 'progress', value: current / total })
}

// One job at a time: the scheduler sends sequentially, but queue defensively.
let chain: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, input, publicPath } = event.data
  chain = chain.then(async () => {
    currentId = id
    try {
      const blob = await removeBackground(input, {
        publicPath,
        progress,
        output: { format: 'image/png', quality: 1 },
      })
      post({ id, type: 'done', blob })
    } catch (error) {
      post({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  })
}

function post(message: WorkerResponse): void {
  self.postMessage(message)
}
