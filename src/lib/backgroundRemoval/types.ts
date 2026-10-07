import type { ProcessOptions } from '../../types'

export type RemovalProgress = (progress: number) => void

/** Optional phase timings for the isolated benchmark harness. */
export type RemovalPhase =
  | 'decode'
  | 'preprocess'
  | 'inference'
  | 'postprocess'

export interface RemovalOptions {
  /** Reserved for future engine-specific knobs; progress is first-class. */
  onProgress?: RemovalProgress
  /** Hint only — engines may ignore unsupported devices. */
  preferredDevice?: 'cpu' | 'webgpu' | 'auto'
  /** Benchmark-only: engines that support it report phase durations (ms). */
  onPhase?: (phase: RemovalPhase, ms: number) => void
}

export interface BackgroundRemovalEngine {
  readonly id: string
  readonly label: string
  initialize(options?: RemovalOptions): Promise<void>
  removeBackground(
    input: Blob,
    options?: RemovalOptions,
  ): Promise<Blob>
  dispose?(): Promise<void>
}

/** Production autoRetouch still lives outside the engine (imageProcessing). */
export type EngineProcessOptions = ProcessOptions
