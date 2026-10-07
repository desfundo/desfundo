import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'

interface DropZoneProps {
  onFiles: (files: FileList | File[]) => void
  disabled?: boolean
}

export function DropZone({ onFiles, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
    },
    [disabled, onFiles],
  )

  return (
    <div
      className={`dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="dropzone-mark" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path
            d="M20 8v18M11 17l9-9 9 9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 28v3a2 2 0 002 2h20a2 2 0 002-2v-3"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="dropzone-title">Solte imagens ou PDFs aqui</p>
      <p className="dropzone-hint">
        ou clique · PNG, JPG, WEBP, PDF · cada página do PDF vira uma foto na fila
      </p>
    </div>
  )
}
