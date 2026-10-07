import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import 'fake-indexeddb/auto'
import {
  createHydrationDedupe,
  createResultPinTable,
  deleteCurrentResult,
  hasCompletableResult,
  loadCurrentResult,
  persistCurrentResult,
  persistThenReleaseIds,
  resultRefFor,
  selectIdleForEviction,
} from './currentResultRetention.ts'
import { createResultStore, type ResultStore } from './resultStore.ts'

function pngishBlob(label: string, size = 32): Blob {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < size; i++) bytes[i] = (label.charCodeAt(0) + i) % 256
  return new Blob([bytes], { type: 'image/png' })
}

describe('currentResultRetention', () => {
  let store: ResultStore

  before(async () => {
    store = await createResultStore()
    await store.clear()
  })

  after(() => {
    store.close()
  })

  it('completed result starts conceptually in memory (ref null until eviction)', () => {
    const item = {
      status: 'done',
      resultBlob: pngishBlob('hot'),
      resultRef: null as string | null,
    }
    assert.equal(hasCompletableResult(item), true)
    assert.ok(item.resultBlob)
    assert.equal(item.resultRef, null)
  })

  it('selectIdleForEviction respects idle age and pins', () => {
    const now = 1_000_000
    const pins = createResultPinTable()
    pins.acquire('pinned')

    const items = [
      {
        id: 'fresh',
        resultBlob: pngishBlob('a'),
        resultTouchedAt: now - 1_000,
      },
      {
        id: 'idle',
        resultBlob: pngishBlob('b'),
        resultTouchedAt: now - 60_000,
      },
      {
        id: 'pinned',
        resultBlob: pngishBlob('c'),
        resultTouchedAt: now - 60_000,
      },
    ]

    const selected = selectIdleForEviction(items, {
      now,
      isPinned: (id) => pins.isPinned(id),
      idleMs: 45_000,
    })
    assert.deepEqual(
      selected.map((s) => s.id),
      ['idle'],
    )
  })

  it('pressure eviction picks oldest above hot cap', () => {
    const now = 1_000_000
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `i-${i}`,
      resultBlob: pngishBlob(String(i)),
      resultTouchedAt: now - 10_000 - i * 100,
    }))
    const selected = selectIdleForEviction(items, {
      now,
      isPinned: () => false,
      idleMs: 45_000,
      pressureIdleMs: 8_000,
      hotCap: 16,
    })
    assert.ok(selected.length >= 4)
    assert.ok(selected.every((s) => now - s.resultTouchedAt >= 8_000))
  })

  it('idle result is persisted then RAM may release', async () => {
    const id = 'evict-1'
    const blob = pngishBlob('E')
    const live = new Map<string, Blob | null>([[id, blob]])

    const released = await persistThenReleaseIds(
      store,
      [{ id, resultBlob: blob, resultTouchedAt: 0 }],
      {
        isPinned: () => false,
        getLiveBlob: (x) => live.get(x),
      },
    )
    assert.deepEqual(released, [id])
    assert.equal(await store.has(resultRefFor(id), 'current'), true)

    // Simulate React drop after successful persist.
    live.set(id, null)
    const item = {
      status: 'done',
      resultBlob: live.get(id) ?? null,
      resultRef: resultRefFor(id),
    }
    assert.equal(item.resultBlob, null)
    assert.equal(hasCompletableResult(item), true)
  })

  it('storage failure preserves RAM (persistThenRelease skips release)', async () => {
    const id = 'fail-1'
    const blob = pngishBlob('F')
    const broken = {
      put: async () => {
        throw new Error('idb down')
      },
      has: async () => false,
      get: async () => null,
      delete: async () => {},
      clear: async () => {},
      close: () => {},
    } as unknown as ResultStore

    const released = await persistThenReleaseIds(
      broken,
      [{ id, resultBlob: blob, resultTouchedAt: 0 }],
      {
        isPinned: () => false,
        getLiveBlob: () => blob,
      },
    )
    assert.deepEqual(released, [])
  })

  it('active pin prevents eviction release', async () => {
    const id = 'pin-1'
    const blob = pngishBlob('P')
    const pins = createResultPinTable()
    pins.acquire(id)

    const released = await persistThenReleaseIds(
      store,
      [{ id, resultBlob: blob, resultTouchedAt: 0 }],
      {
        isPinned: (x) => pins.isPinned(x),
        getLiveBlob: () => blob,
      },
    )
    assert.deepEqual(released, [])
  })

  it('hydration is deduplicated', async () => {
    const dedupe = createHydrationDedupe()
    let loads = 0
    const loader = async () => {
      loads += 1
      await new Promise((r) => setTimeout(r, 20))
      return pngishBlob('H')
    }
    const [a, b] = await Promise.all([
      dedupe.run('same', loader),
      dedupe.run('same', loader),
    ])
    assert.equal(loads, 1)
    assert.equal(a.size, b.size)
  })

  it('stored result hydrates via loadCurrentResult', async () => {
    const id = 'hyd-1'
    const blob = pngishBlob('Z')
    await persistCurrentResult(store, id, blob)
    const out = await loadCurrentResult(store, id)
    assert.ok(out)
    assert.equal(out.size, blob.size)
  })

  it('delete removes stored current; retry overwrite replaces', async () => {
    const id = 'del-1'
    await persistCurrentResult(store, id, pngishBlob('v1'))
    await persistCurrentResult(store, id, pngishBlob('v2', 40))
    const mid = await loadCurrentResult(store, id)
    assert.ok(mid)
    assert.equal(mid.size, 40)
    await deleteCurrentResult(store, id)
    assert.equal(await loadCurrentResult(store, id), null)
  })

  it('editor pin blocks selectIdleForEviction', () => {
    const now = Date.now()
    const pins = createResultPinTable()
    pins.acquire('edit')
    const selected = selectIdleForEviction(
      [
        {
          id: 'edit',
          resultBlob: pngishBlob('e'),
          resultTouchedAt: now - 120_000,
        },
      ],
      { now, isPinned: (id) => pins.isPinned(id) },
    )
    assert.equal(selected.length, 0)
  })
})
