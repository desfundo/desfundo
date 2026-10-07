import { useRef, useState } from 'react'
import { PIX, PIX_HOLDER_FIRST_NAME } from '../config/project'
import { buildPixPayload } from '../lib/pix'

const PAYLOAD = buildPixPayload(PIX)

/** Footer Pix donation: QR (public/pix-qr.svg, from `npm run pix:qr`) + copy buttons. */
export function PixDonate() {
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
        Pix
      </button>
      <dialog
        ref={dialogRef}
        className="pix-dialog"
        onClick={(e) => {
          // Click on the backdrop closes it.
          if (e.target === dialogRef.current) dialogRef.current.close()
        }}
      >
        <h2>Apoie com Pix</h2>
        <p className="pix-holder">
          O Pix cai na conta de <strong>{PIX_HOLDER_FIRST_NAME}</strong>, criador do Desfundo.
          É esse nome que o seu banco vai mostrar na confirmação.
        </p>
        <p>Qualquer valor ajuda. Escaneie com o app do seu banco:</p>
        <img src="./pix-qr.svg" alt="QR code Pix para doação" width={220} height={220} />
        <div className="pix-actions">
          <button type="button" className="btn btn-primary" onClick={() => void copy('payload')}>
            {copied === 'payload' ? 'Copiado!' : 'Copiar Pix copia e cola'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void copy('key')}>
            {copied === 'key' ? 'Copiada!' : 'Copiar chave'}
          </button>
        </div>
        <p className="pix-key">Chave aleatória: {PIX.key}</p>
        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
          Fechar
        </button>
      </dialog>
    </>
  )
}
