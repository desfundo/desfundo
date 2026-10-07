// Legacy build: pdf.js 5.x modern build needs Uint8Array#toHex (Chromium 140+);
// Electron 37 ships Chromium 138, so the modern build fails on every PDF.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { pdfPageFileName, renderScale } from './pdfPages'
import { msg } from '../i18n'

let workerConfigured = false

function ensurePdfWorker(): void {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = workerUrl
  workerConfigured = true
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error(msg().pdfPageWriteFailed))
    }, 'image/png')
  })
}

async function renderPage(
  pdf: Awaited<ReturnType<typeof getDocument>['promise']>,
  pdfName: string,
  pageNumber: number,
  total: number,
): Promise<File> {
  const page = await pdf.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({
      scale: renderScale(base.width, base.height),
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error(msg().pdfCanvasUnavailable)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const blob = await canvasToPng(canvas)
    canvas.width = 0
    canvas.height = 0
    return new File([blob], pdfPageFileName(pdfName, pageNumber, total), {
      type: 'image/png',
    })
  } finally {
    page.cleanup()
  }
}

export async function pdfToPageFiles(
  file: File,
  onPage?: (page: number, total: number) => void,
): Promise<File[]> {
  ensurePdfWorker()
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const files: File[] = []
  try {
    if (pdf.numPages < 1) throw new Error(msg().pdfNoPages)
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onPage?.(pageNumber, pdf.numPages)
      files.push(await renderPage(pdf, file.name, pageNumber, pdf.numPages))
    }
    return files
  } finally {
    await pdf.destroy()
  }
}
