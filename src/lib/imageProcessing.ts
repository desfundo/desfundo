import type { FillBackground, ImageSettings, ProcessOptions } from '../types'
import { getProductionEngine } from './backgroundRemoval/createEngine'
import { msg } from '../i18n'

export function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      reject(new Error(msg().imageLoadFailed))
    }
    img.src = url
  })
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error(msg().imageExportFailed))
    }, type)
  })
}

/** Limpa franjas, aplica limiar de alpha e suaviza bordas. */
export async function autoRetouch(
  input: Blob,
  strength = 0.55,
): Promise<Blob> {
  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error(msg().canvasUnavailable)

  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = imageData

  const low = Math.round(18 + strength * 40)
  const high = Math.round(160 + strength * 70)
  const soft = Math.max(1, Math.round(1 + strength * 2))

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < low) {
      data[i + 3] = 0
      continue
    }
    if (a > high) {
      data[i + 3] = 255
    } else {
      const t = (a - low) / (high - low)
      data[i + 3] = Math.round(t * t * (3 - 2 * t) * 255)
    }

    const alpha = data[i + 3] / 255
    if (alpha > 0.05 && alpha < 0.92) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const max = Math.max(r, g, b)
      const spill = Math.min(1, strength * 1.4)
      data[i] = Math.round(r + (max - r) * spill * (1 - alpha) * 0.65)
      data[i + 1] = Math.round(g + (max - g) * spill * (1 - alpha) * 0.65)
      data[i + 2] = Math.round(b + (max - b) * spill * (1 - alpha) * 0.65)
    }
  }

  if (soft > 0) {
    const alphaCopy = new Uint8ClampedArray(width * height)
    for (let p = 0; p < width * height; p++) alphaCopy[p] = data[p * 4 + 3]

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        let minA = 255
        let maxA = 0
        let sum = 0
        for (let dy = -soft; dy <= soft; dy++) {
          for (let dx = -soft; dx <= soft; dx++) {
            const ny = y + dy
            const nx = x + dx
            if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue
            const a = alphaCopy[ny * width + nx]
            minA = Math.min(minA, a)
            maxA = Math.max(maxA, a)
            sum += a
          }
        }
        const count = (soft * 2 + 1) ** 2
        const avg = sum / count
        let next = alphaCopy[idx]
        if (alphaCopy[idx] < 40 && maxA > 200) next = 0
        else if (alphaCopy[idx] > 210 && minA < 30) next = 255
        else next = Math.round(avg * 0.35 + alphaCopy[idx] * 0.65)
        data[idx * 4 + 3] = next
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvasToBlob(canvas)
}

export async function rotateImage(input: Blob, degrees: number): Promise<Blob> {
  const normalized = ((degrees % 360) + 360) % 360
  if (normalized === 0) return input

  const img = await loadImage(input)
  const rad = (normalized * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const width = Math.round(img.width * cos + img.height * sin)
  const height = Math.round(img.width * sin + img.height * cos)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(msg().canvasUnavailable)

  ctx.clearRect(0, 0, width, height)
  ctx.translate(width / 2, height / 2)
  ctx.rotate(rad)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)

  return canvasToBlob(canvas)
}

export async function flipImage(
  input: Blob,
  flipH: boolean,
  flipV: boolean,
): Promise<Blob> {
  if (!flipH && !flipV) return input
  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(msg().canvasUnavailable)

  ctx.translate(flipH ? img.width : 0, flipV ? img.height : 0)
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  ctx.drawImage(img, 0, 0)
  return canvasToBlob(canvas)
}

export async function adjustBrightnessContrast(
  input: Blob,
  brightness: number,
  contrast: number,
): Promise<Blob> {
  if (!brightness && !contrast) return input
  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(msg().canvasUnavailable)

  // Same CSS filter the card preview uses, so the download matches what was seen.
  ctx.filter = brightnessContrastFilter(brightness, contrast)
  ctx.drawImage(img, 0, 0)
  return canvasToBlob(canvas)
}

export async function trimTransparent(
  input: Blob,
  padding = 0,
): Promise<Blob> {
  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error(msg().canvasUnavailable)

  ctx.drawImage(img, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let top = height
  let left = width
  let right = 0
  let bottom = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        found = true
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }

  if (!found) return input

  const pad = Math.max(0, Math.round(padding))
  left = Math.max(0, left - pad)
  top = Math.max(0, top - pad)
  right = Math.min(width - 1, right + pad)
  bottom = Math.min(height - 1, bottom + pad)

  const tw = right - left + 1
  const th = bottom - top + 1
  const out = document.createElement('canvas')
  out.width = tw
  out.height = th
  const octx = out.getContext('2d')
  if (!octx) throw new Error(msg().canvasUnavailable)
  octx.drawImage(canvas, left, top, tw, th, 0, 0, tw, th)
  return canvasToBlob(out)
}

export async function scaleImage(input: Blob, scale: number): Promise<Blob> {
  const s = Math.max(0.1, Math.min(3, scale))
  if (Math.abs(s - 1) < 0.001) return input

  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * s))
  canvas.height = Math.max(1, Math.round(img.height * s))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(msg().canvasUnavailable)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas)
}

function fillColor(bg: FillBackground): string | null {
  if (bg === 'transparent') return null
  if (bg === 'white') return '#ffffff'
  if (bg === 'black') return '#000000'
  return null
}

export async function applyBackgroundFill(
  input: Blob,
  background: FillBackground,
): Promise<Blob> {
  const color = fillColor(background)
  if (!color) return input

  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(msg().canvasUnavailable)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return canvasToBlob(canvas)
}

export type { PlasticFixResult } from './plasticFix'
export { reducePlasticGlare } from './plasticFix'

export async function removeBackgroundFromFile(
  file: File,
  options: ProcessOptions,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const engine = getProductionEngine()

  let result = await engine.removeBackground(file, {
    onProgress: (p) => onProgress?.(p * 0.85),
  })

  if (options.autoRetouch) {
    onProgress?.(0.85)
    result = await autoRetouch(result, options.retouchStrength)
  }
  onProgress?.(1)
  return result
}

/** Aplica todos os ajustes não destrutivos para exportação/download. */
export async function exportProcessedImage(
  blob: Blob,
  settings: ImageSettings,
): Promise<Blob> {
  let out = blob

  if (settings.trimTransparent) {
    out = await trimTransparent(out, settings.padding)
  } else if (settings.padding > 0) {
    out = await padImage(out, settings.padding)
  }

  out = await flipImage(out, settings.flipH, settings.flipV)
  out = await adjustBrightnessContrast(
    out,
    settings.brightness,
    settings.contrast,
  )
  out = await scaleImage(out, settings.scale)
  out = await rotateImage(out, settings.rotation)
  out = await applyBackgroundFill(out, settings.background)
  return out
}

async function padImage(input: Blob, padding: number): Promise<Blob> {
  const pad = Math.max(0, Math.round(padding))
  if (!pad) return input
  const img = await loadImage(input)
  const canvas = document.createElement('canvas')
  canvas.width = img.width + pad * 2
  canvas.height = img.height + pad * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(msg().canvasUnavailable)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, pad, pad)
  return canvasToBlob(canvas)
}

export function revokeUrl(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

export function previewFilter(settings: ImageSettings): string {
  return brightnessContrastFilter(settings.brightness, settings.contrast)
}

function brightnessContrastFilter(brightness: number, contrast: number): string {
  const b = 1 + brightness / 100
  const c = 1 + contrast / 100
  return `brightness(${b}) contrast(${c})`
}

export function previewTransform(
  settings: ImageSettings,
  viewZoom = 1,
  panX = 0,
  panY = 0,
): string {
  const parts = [
    `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px))`,
  ]
  if (settings.flipH) parts.push('scaleX(-1)')
  if (settings.flipV) parts.push('scaleY(-1)')
  if (settings.rotation) parts.push(`rotate(${settings.rotation}deg)`)
  if (Math.abs(viewZoom - 1) > 0.001) parts.push(`scale(${viewZoom})`)
  return parts.join(' ')
}
