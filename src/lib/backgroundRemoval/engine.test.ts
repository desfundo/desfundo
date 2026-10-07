import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyAlphaMask,
  assertPngBlob,
  buildNchwFloat32,
  createImglyEngine,
  createOrtEngine,
  getProductionEngine,
  maskToAlpha8,
  resetProductionEngineForTests,
  tensorShapeNchw,
  validateInputBlob,
  type BackgroundRemovalEngine,
} from './index.ts'

describe('backgroundRemoval engine abstraction', () => {
  it('production engine is IMG.LY', () => {
    resetProductionEngineForTests()
    const engine = getProductionEngine()
    assert.equal(engine.id, 'imgly')
  })

  it('rejects empty input blob', () => {
    assert.throws(() => validateInputBlob(new Blob()), /vazio/)
  })

  it('mock engine satisfies interface and returns PNG blob', async () => {
    const engine: BackgroundRemovalEngine = {
      id: 'mock',
      label: 'mock',
      async initialize() {},
      async removeBackground(input) {
        validateInputBlob(input)
        return new Blob([new Uint8Array([137, 80, 78, 71])], {
          type: 'image/png',
        })
      },
    }
    await engine.initialize()
    const out = await engine.removeBackground(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    )
    assertPngBlob(out)
    assert.equal(out.type, 'image/png')
  })

  it('imgly adapter rejects empty blob before calling library', async () => {
    const engine = createImglyEngine()
    await assert.rejects(
      () => engine.removeBackground(new Blob()),
      /vazio/,
    )
  })

  it('ORT adapter fails clearly when model cannot load', async () => {
    const engine = createOrtEngine({
      modelUrl: '/models/does-not-exist.onnx',
      executionProviders: ['wasm'],
    })
    // In Node without DOM/ORT EP the failure mode is still a thrown Error.
    await assert.rejects(() => engine.initialize(), /ONNX|onnxruntime|Falha|indispon/)
  })

  it('preprocess builds NCHW float tensor with expected shape', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4)
    for (let i = 0; i < rgba.length; i++) rgba[i] = 128
    const t = buildNchwFloat32(rgba, 2, 2)
    assert.equal(t.length, 1 * 3 * 2 * 2)
    assert.deepEqual(tensorShapeNchw(2, 2), [1, 3, 2, 2])
  })

  it('postprocess maps probabilities and logits to alpha', () => {
    const prob = maskToAlpha8(new Float32Array([0, 0.5, 1]), 3)
    assert.equal(prob[0], 0)
    assert.equal(prob[2], 255)

    const logits = maskToAlpha8(new Float32Array([-10, 0, 10]), 3)
    assert.ok(logits[0]! < 20)
    assert.ok(logits[2]! > 230)
  })

  it('applyAlphaMask composes RGB with mask', () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255])
    const alpha = new Uint8ClampedArray([0, 128])
    const out = applyAlphaMask(rgba, alpha, 2)
    assert.equal(out[3], 0)
    assert.equal(out[7], 128)
    assert.equal(out[0], 10)
  })
})
