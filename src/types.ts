export type ImageStatus = 'queued' | 'processing' | 'done' | 'error'

export type FillBackground = 'transparent' | 'white' | 'black'

export interface ImageSettings {
  autoRetouch: boolean
  retouchStrength: number
  rotation: number
  flipH: boolean
  flipV: boolean
  brightness: number
  contrast: number
  scale: number
  /** 0–100: reduz véu e reflexo de plástico. */
  dehaze: number
  trimTransparent: boolean
  padding: number
  background: FillBackground
}

export interface ProcessedImage {
  id: string
  file: File
  name: string
  /**
   * Preview Object URLs are created lazily by mounted cards (see usePreviewUrl).
   * Kept null in application state so a large queue does not allocate N blob: URLs.
   */
  originalUrl: string | null
  resultUrl: string | null
  /**
   * Current export/edit surface when IN_MEMORY.
   * Null when STORED (`resultRef` set) or not yet processed.
   */
  resultBlob: Blob | null
  /**
   * IndexedDB key for current result (`ResultStore` kind `current`).
   * Set after successful idle eviction; used to hydrate when `resultBlob` is null.
   */
  resultRef: string | null
  /** Last real use of the current result (complete / edit / hydrate / download). */
  resultTouchedAt: number
  /**
   * IndexedDB key for the post-cutout base (`ResultStore` kind `base`).
   */
  baseResultRef: string | null
  /** Eraser / anti-reflection edits were saved on top of the cutout. */
  manuallyEdited?: boolean
  status: ImageStatus
  error?: string
  progress: number
  settings: ImageSettings
}

export interface ProcessOptions {
  autoRetouch: boolean
  retouchStrength: number
}

export const DEFAULT_SETTINGS: ImageSettings = {
  autoRetouch: true,
  retouchStrength: 0.55,
  rotation: 0,
  flipH: false,
  flipV: false,
  brightness: 0,
  contrast: 0,
  scale: 1,
  dehaze: 55,
  trimTransparent: false,
  padding: 0,
  background: 'transparent',
}

export function createDefaultSettings(
  overrides: Partial<ImageSettings> = {},
): ImageSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}
