/**
 * Local result blob store (IndexedDB).
 * Independent of React — holds heavy Blobs off the UI state tree.
 *
 * Phase 8: `base` kind is used by the live batch hook (`baseResultRef`).
 * `current` / `original` kinds remain available for a later migration.
 */

export type ResultKind = 'original' | 'base' | 'current'

export interface ResultStore {
  put(id: string, kind: ResultKind, blob: Blob): Promise<void>
  get(id: string, kind: ResultKind): Promise<Blob | null>
  has(id: string, kind: ResultKind): Promise<boolean>
  /** Delete one kind, or all kinds for `id` when `kind` is omitted. */
  delete(id: string, kind?: ResultKind): Promise<void>
  clear(): Promise<void>
  close(): void
}

const DB_NAME = 'desfundo-results'
const DB_VERSION = 1
const STORE_NAME = 'blobs'

type StoredRecord = {
  key: string
  id: string
  kind: ResultKind
  blob: Blob
  updatedAt: number
}

function recordKey(id: string, kind: ResultKind): string {
  return `${id}::${kind}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('byId', 'id', { unique: false })
      }
    }
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function createResultStore(): Promise<ResultStore> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment')
  }

  let db = await openDb()

  const ensureDb = async () => {
    // Connections can close after versionchange / idle; reopen transparently.
    try {
      db.transaction(STORE_NAME, 'readonly')
    } catch {
      db = await openDb()
    }
    return db
  }

  const put: ResultStore['put'] = async (id, kind, blob) => {
    const database = await ensureDb()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const record: StoredRecord = {
      key: recordKey(id, kind),
      id,
      kind,
      blob,
      updatedAt: Date.now(),
    }
    store.put(record)
    await txDone(tx)
  }

  const get: ResultStore['get'] = async (id, kind) => {
    const database = await ensureDb()
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const row = await reqToPromise<StoredRecord | undefined>(
      store.get(recordKey(id, kind)),
    )
    await txDone(tx)
    return row?.blob ?? null
  }

  const has: ResultStore['has'] = async (id, kind) => {
    const database = await ensureDb()
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const key = await reqToPromise(store.getKey(recordKey(id, kind)))
    await txDone(tx)
    return key !== undefined
  }

  const deleteEntry: ResultStore['delete'] = async (id, kind) => {
    const database = await ensureDb()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    if (kind) {
      store.delete(recordKey(id, kind))
    } else {
      const index = store.index('byId')
      const keys = await reqToPromise(index.getAllKeys(IDBKeyRange.only(id)))
      for (const key of keys) store.delete(key)
    }
    await txDone(tx)
  }

  const clear: ResultStore['clear'] = async () => {
    const database = await ensureDb()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    await txDone(tx)
  }

  const close: ResultStore['close'] = () => {
    db.close()
  }

  return { put, get, has, delete: deleteEntry, clear, close }
}

/** Build a downloadable PNG filename the same way the app export path does. */
export function downloadNameFromStored(
  name: string,
  background: 'transparent' | 'white' | 'black' = 'transparent',
): string {
  const base = name.replace(/\.[^.]+$/, '')
  const suffix = background === 'transparent' ? 'sem-fundo' : 'export'
  return `${base}-${suffix}.png`
}
