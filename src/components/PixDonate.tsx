import { useRef, useState } from 'react'
import { PIX, PIX_HOLDER_FIRST_NAME } from '../config/project'
import { useI18n } from '../i18n'
import { buildPixPayload } from '../lib/pix'

const PAYLOAD = buildPixPayload(PIX)

/** Footer Pix donation: QR (public/pix-qr.svg, from `npm run pix:qr`) + copy buttons. */
export function PixDonate() {
  const { m } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState<'payload' | 'key' | null>(null)

  const copy = async (what: 'payload' | 'key') => {
    try {
      await navigator.clipboard.writeText(what === 'payload' ? PAYLOAD : PIX.key)
      setCopied(what)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  return (
    <>
      <button type="button" className="link-button" onClick={() => dialogRef.current?.showModal()}>
        {m.pix}
      </button>
      <dialog
        ref={dialogRef}
        className="pix-dialog"
        onClick={(e) => {
          // Click on the backdrop closes it.
          if (e.target === dialogRef.current) dialogRef.current.close()
        }}
      >
        <h2>{m.pixTitle}</h2>
        <p className="pix-holder">
          {m.pixHolderBefore}
          <strong>{PIX_HOLDER_FIRST_NAME}</strong>
          {m.pixHolderAfter}
        </p>
        <p>{m.pixAnyAmount}</p>
        <img src="./pix-qr.svg" alt={m.pixQrAlt} width={220} height={220} />
        <div className="pix-actions">
          <button type="button" className="btn btn-primary" onClick={() => void copy('payload')}>
            {copied === 'payload' ? m.copiedPayload : m.copyPayload}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void copy('key')}>
            {copied === 'key' ? m.copiedKey : m.copyKey}
          </button>
        </div>
        <p className="pix-key">{m.randomKey(PIX.key)}</p>
        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
          {m.close}
        </button>
      </dialog>
    </>
  )
}
