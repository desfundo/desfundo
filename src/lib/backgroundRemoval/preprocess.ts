/**
 * Image → NCHW float32 tensor helpers for ORT spike.
 * ImageNet-style normalize (mean/std) matches common BiRefNet / DIS exports.
 */

export const DEFAULT_MEAN = [0.485, 0.456, 0.406] as const
export const DEFAULT_STD = [0.229, 0.224, 0.225] as const

export function validateInputBlob(input: Blob): void {
  if (!input || input.size === 0) {
    throw new Error('Entrada inválida: Blob vazio')
  }
}

/** Letterbox/crop-free: stretch to model size (documented trade-off). */
export function buildNchwFloat32(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mean: readonly number[] = DEFAULT_MEAN,
  std: readonly number[] = DEFAULT_STD,
): Float32Array {
  const out = new Float32Array(1 * 3 * height * width)
  const plane = height * width
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = rgba[i]! / 255
      const g = rgba[i + 1]! / 255
      const b = rgba[i + 2]! / 255
      const idx = y * width + x
      out[idx] = (r - mean[0]!) / std[0]!
      out[plane + idx] = (g - mean[1]!) / std[1]!
      out[2 * plane + idx] = (b - mean[2]!) / std[2]!
    }
  }
  return out
}

export function tensorShapeNchw(height: number, width: number): number[] {
  return [1, 3, height, width]
}
