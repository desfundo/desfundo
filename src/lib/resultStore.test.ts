import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import 'fake-indexeddb/auto'
import {
  createResultStore,
  downloadNameFromStored,
  type ResultStore,
} from './resultStore.ts'

function pngishBlob(label: string, size = 64): Blob {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < size; i++) bytes[i] = (label.charCodeAt(0) + i) % 256
  return new Blob([bytes], { type: 'image/png' })
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('ResultStore (IndexedDB spike)', () => {
  let store: ResultStore

  before(async () => {
    store = await createResultStore()
    await store.clear()
  })

  after(() => {
    store.close()
  })

  it('put / get round-trips a PNG Blob', async () => {
    const input = pngishBlob('a', 128)
    await store.put('img-1', 'current', input)
    const out = await store.get('img-1', 'current')
    assert.ok(out)
    assert.equal(out.type, 'image/png')
    assert.deepEqual(await blobBytes(out), await blobBytes(input))
  })

  it('stores base and current independently', async () => {
    const base = pngishBlob('b', 32)
    const current = pngishBlob('c', 32)
    await store.put('img-2', 'base', base)
    await store.put('img-2', 'current', current)
    assert.deepEqual(
      await blobBytes((await store.get('img-2', 'base'))!),
      await blobBytes(base),
    )
    assert.deepEqual(
      await blobBytes((await store.get('img-2', 'current'))!),
      await blobBytes(current),
    )
  })

  it('overwrite replaces the previous blob for the same key', async () => {
    await store.put('ow-1', 'current', pngishBlob('old', 24))
    await store.put('ow-1', 'current', pngishBlob('new', 24))
    const out = await store.get('ow-1', 'current')
    assert.ok(out)
    assert.deepEqual(await blobBytes(out), await blobBytes(pngishBlob('new', 24)))
  })

  it('has / delete / clear', async () => {
    await store.put('img-3', 'original', pngishBlob('o'))
    assert.equal(await store.has('img-3', 'original'), true)
    await store.delete('img-3', 'original')
    assert.equal(await store.has('img-3', 'original'), false)

    await store.put('img-4', 'base', pngishBlob('x'))
    await store.put('img-4', 'current', pngishBlob('y'))
    await store.delete('img-4')
    assert.equal(await store.has('img-4', 'base'), false)
    assert.equal(await store.has('img-4', 'current'), false)

    await store.put('img-5', 'current', pngishBlob('z'))
    await store.clear()
    assert.equal(await store.has('img-5', 'current'), false)
  })

  it('handles a larger blob (~2 MiB)', async () => {
    const large = pngishBlob('L', 2 * 1024 * 1024)
    await store.put('large', 'current', large)
    const out = await store.get('large', 'current')
    assert.ok(out)
    assert.equal(out.size, large.size)
    // Spot-check edges instead of full 2MiB deepEqual for speed.
    const a = await blobBytes(large)
    const b = await blobBytes(out)
    assert.equal(a[0], b[0])
    assert.equal(a[a.length - 1], b[b.length - 1])
  })

  it('stores multiple records', async () => {
    await store.clear()
    for (let i = 0; i < 25; i++) {
      await store.put(`m-${i}`, 'current', pngishBlob(String(i), 16))
    }
    for (let i = 0; i < 25; i++) {
      assert.equal(await store.has(`m-${i}`, 'current'), true)
    }
  })

  it('survives reopen (same origin / new connection)', async () => {
    await store.clear()
    const blob = pngishBlob('persist', 40)
    await store.put('persist-1', 'current', blob)
    store.close()

    const again = await createResultStore()
    const out = await again.get('persist-1', 'current')
    assert.ok(out)
    assert.deepEqual(await blobBytes(out), await blobBytes(blob))
    again.close()

    // Restore suite store for any later hooks.
    store = await createResultStore()
  })

  it('download-from-store path: get Blob then treat as export source', async () => {
    const stored = pngishBlob('dl', 80)
    await store.put('dl-1', 'current', stored)
    // Release the local reference — only IDB holds the bytes now.
    const retrieved = await store.get('dl-1', 'current')
    assert.ok(retrieved)
    // Mimic downloadOne's first step: operate on the retrieved Blob.
    assert.equal(retrieved.type, 'image/png')
    assert.equal(downloadNameFromStored('photo.jpg'), 'photo-sem-fundo.png')
    assert.equal(downloadNameFromStored('photo.jpg', 'white'), 'photo-export.png')
    // Object URL create/revoke (Node 20+ / browsers).
    const url = URL.createObjectURL(retrieved)
    assert.ok(url.startsWith('blob:'))
    URL.revokeObjectURL(url)
  })
})
