import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { exportProcessedImage } from './imageProcessing'
import { hasCompletableResult } from './currentResultRetention'
import { uniqueZipName } from './zipNames'
import type { ProcessedImage } from '../types'

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export type ResultAccess = {
  ensureResult: (id: string) => Promise<Blob | null>
  pinResult: (id: string) => void
  unpinResult: (id: string) => void
}

export async function downloadOne(
  image: ProcessedImage,
  access?: ResultAccess,
) {
  if (!hasCompletableResult(image) && !image.resultBlob) return

  if (access) access.pinResult(image.id)
  try {
    const source = access
      ? await access.ensureResult(image.id)
      : image.resultBlob
    if (!source) return
    const blob = await exportProcessedImage(source, image.settings)
    const suffix =
      image.settings.background === 'transparent' ? 'sem-fundo' : 'export'
    saveAs(blob, `${baseName(image.name)}-${suffix}.png`)
  } finally {
    if (access) access.unpinResult(image.id)
  }
}

export type ZipReport = { exported: number; failed: string[] }

export async function downloadAll(
  images: ProcessedImage[],
  access?: ResultAccess,
  onProgress?: (done: number, total: number) => void,
): Promise<ZipReport> {
  const ready = images.filter((i) => hasCompletableResult(i))
  if (ready.length === 0) return { exported: 0, failed: [] }

  if (ready.length === 1) {
    try {
      await downloadOne(ready[0], access)
      return { exported: 1, failed: [] }
    } catch {
      return { exported: 0, failed: [ready[0].name] }
    }
  }

  const zip = new JSZip()
  const used = new Set<string>()
  const failed: string[] = []
  let exported = 0
  for (const [index, image] of ready.entries()) {
    onProgress?.(index, ready.length)
    if (access) access.pinResult(image.id)
    try {
      const source = access
        ? await access.ensureResult(image.id)
        : image.resultBlob
      if (!source) throw new Error('Resultado indisponível')
      const blob = await exportProcessedImage(source, image.settings)
      const suffix =
        image.settings.background === 'transparent' ? 'sem-fundo' : 'export'
      zip.file(uniqueZipName(`${baseName(image.name)}-${suffix}.png`, used), blob)
      exported++
    } catch {
      // One bad image must not abort the whole ZIP.
      failed.push(image.name)
    } finally {
      if (access) access.unpinResult(image.id)
    }
  }
  onProgress?.(ready.length, ready.length)
  if (exported === 0) return { exported, failed }

  // PNGs are already compressed: STORE avoids a slow, useless deflate pass.
  const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  saveAs(content, `desfundo-${exported}-imagens.zip`)
  return { exported, failed }
}
