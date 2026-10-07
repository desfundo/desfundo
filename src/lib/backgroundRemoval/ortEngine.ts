import type {
  BackgroundRemovalEngine,
  RemovalOptions,
} from './types'
import {
  buildNchwFloat32,
  tensorShapeNchw,
  validateInputBlob,
} from './preprocess'
import {
  applyAlphaMask,
  assertPngBlob,
  maskToAlpha8,
} from './postprocess'

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(source)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Falha ao carregar imagem'))
    }
    img.src = url
  })
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao exportar PNG'))
    }, 'image/png')
  })
}

export interface OrtEngineConfig {
  /** Local or same-origin URL to `.onnx` (offline target: `/models/...`). */
  modelUrl: string
  inputSize?: number
  mean?: readonly [number, number, number]
  std?: readonly [number, number, number]
  /** rembg DIS uses minmax on the prediction tensor. */
  maskMode?: import('./postprocess').MaskNormalizeMode
  /**
   * ORT execution providers preference.
   * Spike default tries webgpu then wasm — neither is required for production yet.
   */
  executionProviders?: Array<'webgpu' | 'wasm' | 'cpu'>
}

type OrtModule = {
  InferenceSession: {
    create: (
      path: string,
      options?: { executionProviders?: string[] },
    ) => Promise<OrtSession>
  }
  Tensor: new (
    type: string,
    data: Float32Array,
    dims: number[],
  ) => unknown
}

type OrtSession = {
  inputNames: string[]
  outputNames: string[]
  run: (
    feeds: Record<string, unknown>,
  ) => Promise<Record<string, { data: Float32Array }>>
}

/**
 * Isolated ORT spike engine — NOT wired to the batch scheduler.
 * Requires a redistributable ONNX file at `modelUrl` (not bundled in this phase).
 */
export interface OrtEngineHandle extends BackgroundRemovalEngine {
  getActiveExecutionProvider(): string | null
}

export function createOrtEngine(config: OrtEngineConfig): OrtEngineHandle {
  const inputSize = config.inputSize ?? 512
  const mean = config.mean ?? ([0.485, 0.456, 0.406] as const)
  const std = config.std ?? ([0.229, 0.224, 0.225] as const)
  const maskMode = config.maskMode ?? 'auto'
  const providers = config.executionProviders ?? ['webgpu', 'wasm']

  let session: OrtSession | null = null
  let ortModule: OrtModule | null = null
  let activeProvider: string | null = null

  async function ensureSession(options?: RemovalOptions) {
    if (session) return
    options?.onProgress?.(0.02)
    try {
      // types.d.ts exists but package "exports" may not resolve under bundler mode
      const mod = await import('onnxruntime-web')
      ortModule = mod as unknown as OrtModule
    } catch {
      throw new Error(
        'onnxruntime-web indisponível — instale a dependência para o spike ORT',
      )
    }
    const ort = ortModule
    options?.onProgress?.(0.05)
    const errors: string[] = []
    for (const ep of providers) {
      try {
        session = await ort.InferenceSession.create(config.modelUrl, {
          executionProviders: [ep],
        })
        activeProvider = ep
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${ep}: ${msg}`)
      }
    }
    if (!session) {
      throw new Error(
        `Falha ao carregar modelo ONNX (${config.modelUrl}): ${errors.join(' | ')}`,
      )
    }
  }

  return {
    id: 'ort-spike',
    label: `onnxruntime-web (${config.modelUrl})`,

    async initialize(options) {
      await ensureSession(options)
    },

    /** Confirmed EP after successful session create (not a guess). */
    getActiveExecutionProvider() {
      return activeProvider
    },

    async removeBackground(input, options) {
      validateInputBlob(input)
      await ensureSession(options)
      if (!session || !ortModule) {
        throw new Error('Sessão ORT não inicializada')
      }

      const onPhase = options?.onPhase
      options?.onProgress?.(0.1)
      let t0 = performance.now()
      const img = await loadImage(input)
      onPhase?.('decode', performance.now() - t0)
      const srcW = img.width
      const srcH = img.height

      t0 = performance.now()
      const modelCanvas = document.createElement('canvas')
      modelCanvas.width = inputSize
      modelCanvas.height = inputSize
      const mctx = modelCanvas.getContext('2d', { willReadFrequently: true })
      if (!mctx) throw new Error('Canvas indisponível')
      mctx.drawImage(img, 0, 0, inputSize, inputSize)
      const modelData = mctx.getImageData(0, 0, inputSize, inputSize)

      options?.onProgress?.(0.25)
      const tensorData = buildNchwFloat32(
        modelData.data,
        inputSize,
        inputSize,
        mean,
        std,
      )
      const tensor = new ortModule.Tensor(
        'float32',
        tensorData,
        tensorShapeNchw(inputSize, inputSize),
      )
      onPhase?.('preprocess', performance.now() - t0)

      const inputName = session.inputNames[0]!
      options?.onProgress?.(0.35)
      t0 = performance.now()
      const feeds: Record<string, unknown> = { [inputName]: tensor }
      const results = await session.run(feeds)
      onPhase?.('inference', performance.now() - t0)
      options?.onProgress?.(0.75)

      t0 = performance.now()
      const outputName = session.outputNames[0]!
      const out = results[outputName]
      if (!out?.data) {
        throw new Error('Saída ONNX vazia')
      }

      const maskLen = inputSize * inputSize
      const raw = out.data
      const offset = Math.max(0, raw.length - maskLen)
      const slice = raw.subarray(offset, offset + maskLen)
      const alphaSmall = maskToAlpha8(slice, maskLen, maskMode)

      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = inputSize
      maskCanvas.height = inputSize
      const mk = maskCanvas.getContext('2d', { willReadFrequently: true })
      if (!mk) throw new Error('Canvas indisponível')
      const maskImg = mk.createImageData(inputSize, inputSize)
      for (let i = 0; i < maskLen; i++) {
        const a = alphaSmall[i]!
        const o = i * 4
        maskImg.data[o] = 255
        maskImg.data[o + 1] = 255
        maskImg.data[o + 2] = 255
        maskImg.data[o + 3] = a
      }
      mk.putImageData(maskImg, 0, 0)

      const full = document.createElement('canvas')
      full.width = srcW
      full.height = srcH
      const fctx = full.getContext('2d', { willReadFrequently: true })
      if (!fctx) throw new Error('Canvas indisponível')
      fctx.drawImage(img, 0, 0)
      const rgba = fctx.getImageData(0, 0, srcW, srcH)

      const maskFull = document.createElement('canvas')
      maskFull.width = srcW
      maskFull.height = srcH
      const mf = maskFull.getContext('2d', { willReadFrequently: true })
      if (!mf) throw new Error('Canvas indisponível')
      mf.drawImage(maskCanvas, 0, 0, srcW, srcH)
      const maskRgba = mf.getImageData(0, 0, srcW, srcH)
      const alpha = new Uint8ClampedArray(srcW * srcH)
      for (let i = 0; i < alpha.length; i++) {
        alpha[i] = maskRgba.data[i * 4 + 3]!
      }

      const composed = applyAlphaMask(rgba.data, alpha, srcW * srcH)
      rgba.data.set(composed)
      fctx.putImageData(rgba, 0, 0)

      options?.onProgress?.(0.92)
      const blob = await canvasToPng(full)
      onPhase?.('postprocess', performance.now() - t0)
      assertPngBlob(blob)
      options?.onProgress?.(1)
      return blob
    },

    async dispose() {
      session = null
      ortModule = null
      activeProvider = null
    },
  }
}
