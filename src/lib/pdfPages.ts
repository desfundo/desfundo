/** Longest side of a rendered page. Keeps catalog pages usable without huge RAM. */
export const PDF_PAGE_MAX_SIDE = 1600

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function pdfPageFileName(pdfName: string, page: number, total: number): string {
  const base = pdfName.replace(/\.pdf$/i, '') || 'catalogo'
  const width = String(Math.max(total, 1)).length
  return `${base}-p${String(page).padStart(width, '0')}.png`
}

/** PDF user space is 72 dpi. Cap the scale so the longest side stays near PDF_PAGE_MAX_SIDE. */
export function renderScale(width: number, height: number, maxSide = PDF_PAGE_MAX_SIDE): number {
  const longest = Math.max(width, height)
  if (!Number.isFinite(longest) || longest <= 0) return 1
  return Math.min(2, maxSide / longest)
}
