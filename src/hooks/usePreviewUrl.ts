import { useEffect, useState } from 'react'
import { revokeUrl } from '../lib/imageProcessing'

/**
 * Creates a blob: Object URL for preview only.
 * Revokes on unmount or when `source` identity changes.
 * Application state must keep File/Blob — never rely on this URL for download/edit.
 */
export function usePreviewUrl(source: Blob | File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!source) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(source)
    setUrl(next)
    return () => {
      revokeUrl(next)
    }
  }, [source])

  return url
}
