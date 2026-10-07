import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createBatchScheduler,
  DEFAULT_BATCH_CONCURRENCY,
} from './batchScheduler.ts'

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe('BatchScheduler', () => {
  it('defaults concurrency to 1', () => {
    const s = createBatchScheduler({ process: async () => {} })
    assert.equal(s.concurrency, DEFAULT_BATCH_CONCURRENCY)
    assert.equal(s.concurrency, 1)
  })

  it('enqueues and preserves FIFO order', async () => {
    const order: string[] = []
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        order.push(id)
      },
    })
    s.enqueue(['a', 'b', 'c'])
    assert.deepEqual(s.getState().queuedIds, ['a', 'b', 'c'])
    await s.start()
    assert.deepEqual(order, ['a', 'b', 'c'])
    assert.deepEqual(s.getState().queuedIds, [])
  })

  it('skips duplicate enqueue while queued or active', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const runs: string[] = []
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        runs.push(id)
        if (id === 'a') await gate
      },
    })
    s.enqueue(['a', 'a', 'b'])
    assert.deepEqual(s.getState().queuedIds, ['a', 'b'])
    const done = s.start()
    await delay(5)
    s.enqueue(['a', 'b'])
    assert.ok(s.getState().activeIds.includes('a') || runs.includes('a'))
    // 'a' active → not re-queued; 'b' still queued once
    assert.equal(s.getState().queuedIds.filter((id) => id === 'b').length, 1)
    release()
    await done
    assert.deepEqual(runs, ['a', 'b'])
  })

  it('runs with concurrency = 1 (no overlap)', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const s = createBatchScheduler({
      concurrency: 1,
      process: async () => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await delay(20)
        concurrent -= 1
      },
    })
    s.enqueue(['1', '2', '3', '4'])
    await s.start()
    assert.equal(maxConcurrent, 1)
  })

  it('processes sequentially for success path', async () => {
    const timeline: string[] = []
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        timeline.push(`start:${id}`)
        await delay(5)
        timeline.push(`end:${id}`)
      },
    })
    s.enqueue(['x', 'y'])
    await s.start()
    assert.deepEqual(timeline, ['start:x', 'end:x', 'start:y', 'end:y'])
  })

  it('isolates errors and continues the queue', async () => {
    const ok: string[] = []
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        if (id === 'bad') throw new Error('fail')
        ok.push(id)
      },
    })
    s.enqueue(['a', 'bad', 'c'])
    await s.start()
    assert.deepEqual(ok, ['a', 'c'])
    assert.equal(s.isRunning(), false)
  })

  it('cancel stops pending jobs but lets the active job finish', async () => {
    const finished: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        if (id === '1') await gate
        finished.push(id)
      },
    })
    s.enqueue(['1', '2', '3'])
    const run = s.start()
    await delay(5)
    assert.deepEqual(s.getState().activeIds, ['1'])
    s.cancel()
    assert.deepEqual(s.getState().queuedIds, [])
    assert.equal(s.getState().cancelled, true)
    release()
    await run
    assert.deepEqual(finished, ['1'])
    assert.ok(!finished.includes('2'))
    assert.ok(!finished.includes('3'))
  })

  it('enqueuePriority runs retry before later FIFO items', async () => {
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        order.push(id)
        if (id === 'hold') await gate
      },
    })
    s.enqueue(['hold', 'later'])
    const run = s.start()
    await delay(5)
    s.enqueuePriority('retry')
    release()
    await run
    assert.deepEqual(order, ['hold', 'retry', 'later'])
  })

  it('cancel does not invent result destruction (scheduler holds no blobs)', async () => {
    const completed = new Map<string, { blob: string }>()
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        completed.set(id, { blob: `result-${id}` })
        await delay(5)
      },
    })
    s.enqueue(['a', 'b', 'c'])
    const run = s.start()
    await delay(8)
    s.cancel()
    await run
    // Whatever finished stays in the external store — scheduler never copied blobs.
    for (const [, value] of completed) {
      assert.ok(value.blob.startsWith('result-'))
    }
    assert.ok(completed.has('a'))
  })

  it('start after cancel can process a new enqueue (retry batch)', async () => {
    const order: string[] = []
    const s = createBatchScheduler({
      concurrency: 1,
      process: async (id) => {
        order.push(id)
        await delay(1)
      },
    })
    s.enqueue(['a', 'b'])
    const first = s.start()
    s.cancel()
    await first
    s.enqueue(['c'])
    await s.start()
    assert.ok(order.includes('c'))
    assert.ok(!order.includes('b'))
  })
})
