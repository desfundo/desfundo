export interface PlasticFixResult {
  blob: Blob
  color: { r: number; g: number; b: number }
}

function loadImage(source: Blob | string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      reject(new Error('Falha ao carregar imagem'))
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao exportar imagem'))
    }, type)
  })
}

function lumOf(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function satOf(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max < 1 ? 0 : (max - min) / max
}

/** 0 = plástico normal, 1 = reflexo forte (branco/acinzentado). */
function glareAmount(r: number, g: number, b: number) {
  const lum = lumOf(r, g, b) / 255
  const sat = satOf(r, g, b)
  const bright = Math.max(0, (lum - 0.55) / 0.45)
  const flat = Math.max(0, 1 - sat / 0.28)
  return Math.min(1, bright * flat)
}

/**
 * Trata a área pintada:
 * 1) máscara com borda suave
 * 2) reconstitui cor com média ponderada de vizinhos limpos (não só o mais próximo)
 * 3) suaviza com filtro bilateral (preserva bordas do objeto)
 * 4) nitidez leve opcional só na textura restante
 */
export async function reducePlasticGlare(
  input: Blob,
  amount: number,
  maskAlpha?: Uint8ClampedArray | null,
  reference?: Blob | File | null,
  sharpenAmount = 40,
): Promise<PlasticFixResult> {
  const s = Math.max(0.25, Math.min(1, amount / 100))
  const sharp = Math.max(0, Math.min(1, sharpenAmount / 100))

  const img = await loadImage(input)
  const width = img.width
  const height = img.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas indisponível')

  ctx.drawImage(img, 0, 0)
  const srcData = ctx.getImageData(0, 0, width, height)
  const src = srcData.data

  if (maskAlpha && maskAlpha.length !== width * height) {
    throw new Error('Máscara inválida')
  }

  let ref: Uint8ClampedArray | null = null
  if (reference) {
    const refImg = await loadImage(reference)
    const rc = document.createElement('canvas')
    rc.width = width
    rc.height = height
    const rctx = rc.getContext('2d', { willReadFrequently: true })
    if (rctx) {
      rctx.drawImage(refImg, 0, 0, width, height)
      ref = rctx.getImageData(0, 0, width, height).data
    }
  }

  // Borda mais larga = transição natural entre tratado e original
  const feather = Math.max(2, Math.round(2 + s * 4))
  const mask = maskAlpha
    ? softMask(maskAlpha, width, height, feather)
    : filledMask(width * height)

  const clean = new Uint8Array(width * height)
  for (let p = 0; p < width * height; p++) {
    const i = p * 4
    if (src[i + 3] < 16) continue
    if (mask[p] > 48) continue
    if (glareAmount(src[i], src[i + 1], src[i + 2]) > 0.55) continue
    clean[p] = 1
  }

  // Buffer intermediário: reconstituição de cor
  const filled = new Float32Array(width * height * 4)
  for (let i = 0; i < src.length; i++) filled[i] = src[i]

  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumN = 0

  const searchR = Math.max(10, Math.round(8 + s * 22))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const m = mask[p] / 255
      if (m < 0.03) continue
      const i = p * 4
      if (src[i + 3] < 8) continue

      const sample = sampleCleanColorIdw(
        src,
        ref,
        clean,
        width,
        height,
        x,
        y,
        searchR,
      )

      const r0 = src[i]
      const g0 = src[i + 1]
      const b0 = src[i + 2]
      const gAmt = glareAmount(r0, g0, b0)

      let fillR = sample?.r ?? r0
      let fillG = sample?.g ?? g0
      let fillB = sample?.b ?? b0

      // Com foto original: puxa matiz dela onde não há glare
      if (ref) {
        const rr = ref[i]
        const rg = ref[i + 1]
        const rb = ref[i + 2]
        if (glareAmount(rr, rg, rb) < 0.45) {
          const tw = 0.35 + (1 - gAmt) * 0.35
          fillR = fillR * (1 - tw) + rr * tw
          fillG = fillG * (1 - tw) + rg * tw
          fillB = fillB * (1 - tw) + rb * tw
        }
      }

      // Reflexo forte: troca mais a luminância; plástico “sujo”: mais a cor
      const mix = Math.min(1, m * s * (0.55 + gAmt * 0.55))
      const outR = r0 + (fillR - r0) * mix
      const outG = g0 + (fillG - g0) * mix
      const outB = b0 + (fillB - b0) * mix

      // Abaixa o pico branco do reflexo em direção à luminância vizinha
      const lum0 = lumOf(r0, g0, b0)
      const lumF = lumOf(fillR, fillG, fillB)
      if (gAmt > 0.2 && lum0 > lumF) {
        const targetLum = lum0 + (lumF - lum0) * mix * (0.65 + gAmt * 0.35)
        const scale = lum0 > 1 ? targetLum / lum0 : 1
        filled[i] = Math.min(255, outR * scale)
        filled[i + 1] = Math.min(255, outG * scale)
        filled[i + 2] = Math.min(255, outB * scale)
      } else {
        filled[i] = outR
        filled[i + 1] = outG
        filled[i + 2] = outB
      }
      filled[i + 3] = src[i + 3]

      sumR += fillR
      sumG += fillG
      sumB += fillB
      sumN++
    }
  }

  // Suavização bilateral na área — remove ruído/manchas sem borrar a silhueta
  const smoothR = Math.max(2, Math.round(2 + s * 3))
  const smoothed = bilateralSmooth(filled, src, mask, width, height, smoothR, s)

  const out = ctx.createImageData(width, height)
  const dst = out.data

  for (let p = 0; p < width * height; p++) {
    const i = p * 4
    const m = mask[p] / 255
    if (m < 0.02) {
      dst[i] = src[i]
      dst[i + 1] = src[i + 1]
      dst[i + 2] = src[i + 2]
      dst[i + 3] = src[i + 3]
      continue
    }
    // Quanto mais no centro da máscara, mais suave; na borda volta ao original
    const edge = Math.min(1, m * 1.35)
    const blend = edge * (0.7 + s * 0.3)
    dst[i] = Math.round(src[i] + (smoothed[i] - src[i]) * blend)
    dst[i + 1] = Math.round(src[i + 1] + (smoothed[i + 1] - src[i + 1]) * blend)
    dst[i + 2] = Math.round(src[i + 2] + (smoothed[i + 2] - src[i + 2]) * blend)
    dst[i + 3] = src[i + 3]
  }

  if (sharp > 0.04) {
    // Nitidez bem mais contida — só recupera um pouco de textura
    sharpenMasked(dst, src, mask, width, height, 0.15 + sharp * 0.45)
  }

  ctx.putImageData(out, 0, 0)

  const color =
    sumN > 0
      ? {
          r: Math.round(sumR / sumN),
          g: Math.round(sumG / sumN),
          b: Math.round(sumB / sumN),
        }
      : { r: 128, g: 128, b: 128 }

  return { blob: await canvasToBlob(canvas), color }
}

/** Nitidez unsharp leve em imagem inteira (para ajuste geral). */
export async function sharpenImage(
  input: Blob,
  amount: number,
): Promise<Blob> {
  const s = Math.max(0, Math.min(1, amount / 100))
  if (s < 0.02) return input

  const img = await loadImage(input)
  const width = img.width
  const height = img.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas indisponível')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, width, height)
  const original = new Uint8ClampedArray(data.data)
  const mask = filledMask(width * height)
  sharpenMasked(data.data, original, mask, width, height, 0.25 + s * 1.1)
  ctx.putImageData(data, 0, 0)
  return canvasToBlob(canvas)
}

/**
 * Média ponderada por distância inversa de vários vizinhos limpos.
 * Evita o “carimbo” do pixel único mais próximo.
 */
function sampleCleanColorIdw(
  src: Uint8ClampedArray,
  ref: Uint8ClampedArray | null,
  clean: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  maxR: number,
): { r: number; g: number; b: number } | null {
  let wr = 0
  let wg = 0
  let wb = 0
  let wSum = 0
  let found = 0

  for (let rad = 1; rad <= maxR; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const p = y * width + x
        if (!clean[p]) continue

        const i = p * 4
        let r = src[i]
        let g = src[i + 1]
        let b = src[i + 2]
        if (ref && glareAmount(ref[i], ref[i + 1], ref[i + 2]) < 0.5) {
          r = ref[i]
          g = ref[i + 1]
          b = ref[i + 2]
        }

        const dist = Math.hypot(dx, dy)
        const w = 1 / (dist * dist + 0.5)
        wr += r * w
        wg += g * w
        wb += b * w
        wSum += w
        found++
      }
    }
    // Com alguns vizinhos próximos já dá pra parar (mais rápido e local)
    if (found >= 8 && rad >= 3) break
  }

  if (wSum > 0.01) {
    return {
      r: wr / wSum,
      g: wg / wSum,
      b: wb / wSum,
    }
  }

  // Fallback: média local evitando glare
  let fr = 0
  let fg = 0
  let fb = 0
  let n = 0
  const data = ref ?? src
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const i = (y * width + x) * 4
      const a = ref ? 255 : src[i + 3]
      if (a < 16) continue
      if (glareAmount(data[i], data[i + 1], data[i + 2]) > 0.6) continue
      const w = 1 / (1 + Math.hypot(dx, dy))
      fr += data[i] * w
      fg += data[i + 1] * w
      fb += data[i + 2] * w
      n += w
    }
  }
  if (n < 0.01) return null
  return { r: fr / n, g: fg / n, b: fb / n }
}

/**
 * Bilateral simplificado: suaviza onde a cor é parecida (reflexo/mancha),
 * preserva onde há borda forte no original.
 */
function bilateralSmooth(
  filled: Float32Array,
  guide: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  strength: number,
): Float32Array {
  const out = new Float32Array(filled.length)
  out.set(filled)

  const sigmaSpace = radius * 0.65
  const sigmaColor = 28 + strength * 36
  const twoSigSp2 = 2 * sigmaSpace * sigmaSpace
  const twoSigCol2 = 2 * sigmaColor * sigmaColor

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const m = mask[p] / 255
      if (m < 0.04) continue
      const i = p * 4
      if (guide[i + 3] < 8) continue

      const gr = guide[i]
      const gg = guide[i + 1]
      const gb = guide[i + 2]

      let wr = 0
      let wg = 0
      let wb = 0
      let wSum = 0

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const ni = (ny * width + nx) * 4
          if (guide[ni + 3] < 8) continue

          // Guia pelo original: bordas do produto não misturam
          const dr = guide[ni] - gr
          const dg = guide[ni + 1] - gg
          const db = guide[ni + 2] - gb
          const colorDist2 = dr * dr + dg * dg + db * db
          const spaceDist2 = dx * dx + dy * dy
          const w =
            Math.exp(-spaceDist2 / twoSigSp2) *
            Math.exp(-colorDist2 / twoSigCol2)

          wr += filled[ni] * w
          wg += filled[ni + 1] * w
          wb += filled[ni + 2] * w
          wSum += w
        }
      }

      if (wSum < 1e-6) continue
      // Mistura com o preenchido: força controla quanto “embaça” de propósito
      const t = m * (0.55 + strength * 0.4)
      out[i] = filled[i] + (wr / wSum - filled[i]) * t
      out[i + 1] = filled[i + 1] + (wg / wSum - filled[i + 1]) * t
      out[i + 2] = filled[i + 2] + (wb / wSum - filled[i + 2]) * t
    }
  }

  return out
}

function sharpenMasked(
  dst: Uint8ClampedArray,
  original: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
) {
  const src = new Uint8ClampedArray(dst)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      const m = mask[p] / 255
      if (m < 0.08) continue
      const i = p * 4
      if (original[i + 3] < 8) continue

      // Não afiar pixels ainda muito “brancos” — evita recriar reflexo
      if (glareAmount(src[i], src[i + 1], src[i + 2]) > 0.7) continue

      for (let c = 0; c < 3; c++) {
        const center = src[i + c]
        const up = src[((y - 1) * width + x) * 4 + c]
        const down = src[((y + 1) * width + x) * 4 + c]
        const left = src[(y * width + (x - 1)) * 4 + c]
        const right = src[(y * width + (x + 1)) * 4 + c]
        const blur = (center * 4 + up + down + left + right) / 8
        const detail = center - blur
        const mixed = center + detail * amount * m
        dst[i + c] = Math.max(0, Math.min(255, Math.round(mixed)))
      }
    }
  }
}

function filledMask(len: number) {
  const m = new Uint8ClampedArray(len)
  m.fill(255)
  return m
}

function softMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius < 1) return new Uint8ClampedArray(mask)
  const out = new Uint8ClampedArray(mask.length)
  const tmp = new Float32Array(mask.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.min(width - 1, Math.max(0, x + dx))
        sum += mask[y * width + nx]
        n++
      }
      tmp[y * width + x] = sum / n
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy))
        sum += tmp[ny * width + x]
        n++
      }
      out[y * width + x] = Math.round(sum / n)
    }
  }

  return out
}
