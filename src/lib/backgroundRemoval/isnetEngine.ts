import { createOrtEngine, type OrtEngineConfig, type OrtEngineHandle } from './ortEngine'
import type { BackgroundRemovalEngine } from './types'

/** rembg DIS / isnet-general-use preprocess + postprocess conventions. */
export const ISNET_GENERAL_USE = {
  modelUrl: '/models/isnet-general-use.onnx',
  inputSize: 1024,
  mean: [0.5, 0.5, 0.5] as const,
  std: [1.0, 1.0, 1.0] as const,
  maskMode: 'minmax' as const,
}

export function createIsnetOrtEngine(
  overrides: Partial<OrtEngineConfig> = {},
): OrtEngineHandle {
  return createOrtEngine({
    ...ISNET_GENERAL_USE,
    executionProviders: ['wasm'],
    ...overrides,
  })
}

/** @deprecated keep BackgroundRemovalEngine assignable for callers */
export type IsnetEngine = BackgroundRemovalEngine
