import { useSyncExternalStore } from 'react'
import { messages, type Lang, type Messages } from './messages'

export type { Lang, Messages }

const STORAGE_KEY = 'lang'

/**
 * Saved choice first; otherwise Portuguese only when the *primary* system language is
 * Portuguese. (Chromium also lists secondary languages, e.g. ["en-US", "pt-BR"].)
 */
function detectLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  const primary = globalThis.navigator?.languages?.[0] ?? globalThis.navigator?.language ?? ''
  return primary.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

let current: Lang = detectLang()
const listeners = new Set<() => void>()

function syncDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = current === 'pt' ? 'pt-BR' : 'en'
  document.title = messages[current].docTitle
}
syncDocument()

export function getLang(): Lang {
  return current
}

/** Current strings, for code outside React (error messages, confirms). */
export function msg(): Messages {
  return messages[current]
}

export function setLang(next: Lang): void {
  if (next === current) return
  current = next
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next)
  } catch {
    /* storage unavailable: choice lasts for this session only */
  }
  syncDocument()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders the component when the language changes. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang)
  return { lang, m: messages[lang], setLang }
}
