/**
 * Model mask → RGBA PNG composition (pure buffer helpers + optional canvas export).
 */

type Float32ArrayLike = { [index: number]: number; length: number }

export type MaskNormalizeMode = 'auto' | 'minmax' | 'sigmoid'

/**
 * Map raw model output to 0–255 alpha.
 * - `minmax`: rembg/DIS style (pred - min) / (max - min)
 * - `sigmoid`: treat as logits
 * - `auto`: minmax if range outside [0,1], else probabilities
 */
export function maskToAlpha8(
  raw: Float32Array | Float32ArrayLike,
  length: number,
  mode: MaskNormalizeMode = 'auto',
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(length)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < length; i++) {
    const v = Number(raw[i] ?? 0)
    if (v < min) min = v
    if (v > max) max = v
  }

  const outsideUnit = min < -0.01 || max > 1.01
  const useMinMax = mode === 'minmax' || (mode === 'auto' && outsideUnit)

  if (useMinMax) {
    const span = max - min || 1
    for (let i = 0; i < length; i++) {
      const v = (Number(raw[i] ?? 0) - min) / span
      alpha[i] = Math.max(0, Math.min(255, Math.round(v * 255)))
    }
    return alpha
  }

  if (mode === 'sigmoid') {
    for (let i = 0; i < length; i++) {
      const v = 1 / (1 + Math.exp(-Number(raw[i] ?? 0)))
      alpha[i] = Math.max(0, Math.min(255, Math.round(v * 255)))
    }
    return alpha
  }

  for (let i = 0; i < length; i++) {
    const v = Number(raw[i] ?? 0)
    alpha[i] = Math.max(0, Math.min(255, Math.round(v * 255)))
  }
  return alpha
}

/** Apply alpha mask onto source RGBA (same dimensions). */
export function applyAlphaMask(
  rgba: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  pixelCount: number,
): Uint8ClampedArray {
  if (alpha.length < pixelCount) {
    throw new Error('Máscara menor que a imagem')
  }
  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    out[o] = rgba[o]!
    out[o + 1] = rgba[o + 1]!
    out[o + 2] = rgba[o + 2]!
    out[o + 3] = alpha[i]!
  }
  return out
}

export function assertPngBlob(blob: Blob): void {
  if (!blob || blob.size === 0) {
    throw new Error('Saída inválida: Blob vazio')
  }
  if (blob.type && blob.type !== 'image/png' && !blob.type.includes('png')) {
    if (blob.type.length > 0) {
      throw new Error(`Saída inesperada: ${blob.type}`)
    }
  }
}
