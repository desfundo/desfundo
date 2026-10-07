import type { ResultStore } from './resultStore'

/** IndexedDB kind used for post-cutout base (pre / independent of autoRetouch). */
export const BASE_RESULT_KIND = 'base' as const

/**
 * Deterministic store key / React ref for an image's base result.
 * Same as the image id — overwrite on retry/reprocess; no version suffixes.
 */
export function baseResultRefFor(imageId: string): string {
  return imageId
}

/** Persist base PNG and return the lightweight ref for React state. */
export async function persistBaseResult(
  store: ResultStore,
  imageId: string,
  blob: Blob,
): Promise<string> {
  const ref = baseResultRefFor(imageId)
  await store.put(ref, BASE_RESULT_KIND, blob)
  return ref
}

/** Load base for reaplicar retoque — caller must not keep the Blob in React state. */
export async function loadBaseResult(
  store: ResultStore,
  ref: string | null | undefined,
): Promise<Blob | null> {
  if (!ref) return null
  return store.get(ref, BASE_RESULT_KIND)
}

export async function deleteBaseResult(
  store: ResultStore,
  ref: string | null | undefined,
): Promise<void> {
  if (!ref) return
  await store.delete(ref, BASE_RESULT_KIND)
}

export async function deleteBaseResults(
  store: ResultStore,
  refs: readonly (string | null | undefined)[],
): Promise<void> {
  for (const ref of refs) {
    await deleteBaseResult(store, ref)
  }
}
