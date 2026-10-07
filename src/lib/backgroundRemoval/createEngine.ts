import { createImglyEngine } from './imglyEngine'
import type { BackgroundRemovalEngine } from './types'

let singleton: BackgroundRemovalEngine | null = null

/** Production engine — always IMG.LY until an explicit migration cuts over. */
export function getProductionEngine(): BackgroundRemovalEngine {
  if (!singleton) {
    singleton = createImglyEngine()
  }
  return singleton
}

export function resetProductionEngineForTests(): void {
  singleton = null
}
