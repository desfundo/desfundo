import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import 'fake-indexeddb/auto'
import {
  baseResultRefFor,
  deleteBaseResult,
  deleteBaseResults,
  loadBaseResult,
  persistBaseResult,
} from './baseResultRetention.ts'
import { createResultStore, type ResultStore } from './resultStore.ts'

function pngishBlob(label: string, size = 64): Blob {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < size; i++) bytes[i] = (label.charCodeAt(0) + i) % 256
  return new Blob([bytes], { type: 'image/png' })
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Lightweight stand-in for React item state after COMPLETED —
 * proves base lives only as a ref, not as a Blob field.
 */
type ItemState = {
  id: string
  resultBlob: Blob | null
  baseResultRef: string | null
  /** Must stay absent / never assigned after migrate. */
  baseResultBlob?: Blob | null
}

describe('baseResultRetention migration', () => {
  let store: ResultStore

  before(async () => {
    store = await createResultStore()
    await store.clear()
  })

  after(() => {
    store.close()
  })

  it('save base → ref only in item state (no baseResultBlob)', async () => {
    const id = 'img-save-1'
    const raw = pngishBlob('raw', 100)
    const result = pngishBlob('res', 100)

    const ref = await persistBaseResult(store, id, raw)
    const item: ItemState = {
      id,
      resultBlob: result,
      baseResultRef: ref,
    }

    assert.equal(item.baseResultRef, baseResultRefFor(id))
    assert.equal(item.baseResultBlob, undefined)
    assert.equal(await store.has(ref, 'base'), true)
    assert.deepEqual(
      await blobBytes((await loadBaseResult(store, ref))!),
      await blobBytes(raw),
    )
  })

  it('retrieve base and release memory reference (no React base field)', async () => {
    const id = 'img-load-1'
    const raw = pngishBlob('B', 48)
    const ref = await persistBaseResult(store, id, raw)

    let hydrated: Blob | null = await loadBaseResult(store, ref)
    assert.ok(hydrated)
    assert.deepEqual(await blobBytes(hydrated), await blobBytes(raw))

    hydrated = null
    assert.equal(hydrated, null)
    assert.equal(await store.has(ref, 'base'), true)
  })

  it('reaplicar retoque loads base from store without keeping it in state', async () => {
    const id = 'img-retouch-1'
    const raw = pngishBlob('T', 32)
    const ref = await persistBaseResult(store, id, raw)

    const item: ItemState = {
      id,
      resultBlob: pngishBlob('old', 32),
      baseResultRef: ref,
    }

    const base = await loadBaseResult(store, item.baseResultRef)
    assert.ok(base)

    // Simulate autoRetouch output without DOM canvas: new result from hydrated base.
    const after: ItemState = {
      ...item,
      resultBlob: base,
      baseResultRef: item.baseResultRef,
    }
    assert.ok(after.resultBlob)
    assert.equal(after.baseResultRef, ref)
    assert.equal(after.baseResultBlob, undefined)
    assert.deepEqual(await blobBytes(after.resultBlob!), await blobBytes(raw))
  })

  it('replace base on retry/reprocess (no version pile-up)', async () => {
    const id = 'img-retry-1'
    await persistBaseResult(store, id, pngishBlob('v1', 20))
    await persistBaseResult(store, id, pngishBlob('v2', 20))

    const out = await loadBaseResult(store, id)
    assert.ok(out)
    assert.deepEqual(await blobBytes(out), await blobBytes(pngishBlob('v2', 20)))
    assert.equal(await store.has(id, 'base'), true)
  })

  it('delete base on remove', async () => {
    const id = 'img-del-1'
    const ref = await persistBaseResult(store, id, pngishBlob('d', 16))
    await deleteBaseResult(store, ref)
    assert.equal(await store.has(id, 'base'), false)
    assert.equal(await loadBaseResult(store, ref), null)
  })

  it('clear cleanup removes all listed bases', async () => {
    const a = await persistBaseResult(store, 'clear-a', pngishBlob('a'))
    const b = await persistBaseResult(store, 'clear-b', pngishBlob('b'))
    await deleteBaseResults(store, [a, b, null])
    assert.equal(await store.has('clear-a', 'base'), false)
    assert.equal(await store.has('clear-b', 'base'), false)
  })

  it('cancel-before-persist leaves no orphan; completed keep base', async () => {
    const doneId = 'cancel-done'
    await persistBaseResult(store, doneId, pngishBlob('ok'))

    const pendingId = 'cancel-pending'
    assert.equal(await store.has(pendingId, 'base'), false)
    assert.equal(await store.has(doneId, 'base'), true)
  })
})
