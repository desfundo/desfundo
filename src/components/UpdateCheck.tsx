import { useState } from 'react'
import { useI18n } from '../i18n'
import { findUpdate, isStoreBuild, type UpdateInfo } from '../lib/updateCheck'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; update: UpdateInfo }
  | { kind: 'failed' }

/** Footer button; hidden in the Store build, which Windows keeps up to date. */
export function UpdateCheck() {
  const { m } = useI18n()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  if (isStoreBuild()) return null

  const check = async () => {
    setStatus({ kind: 'checking' })
    try {
      const update = await findUpdate(__APP_VERSION__)
      setStatus(update ? { kind: 'available', update } : { kind: 'latest' })
    } catch {
      setStatus({ kind: 'failed' })
    }
  }

  if (status.kind === 'available') {
    return (
      <a className="update-check update-available" href={status.update.url} target="_blank" rel="noreferrer">
        {m.updateAvailable(status.update.version)}
      </a>
    )
  }

  return (
    <span className="update-check">
      <button type="button" onClick={check} disabled={status.kind === 'checking'}>
        {status.kind === 'checking' ? m.updateChecking : m.updateCheck}
      </button>
      {status.kind === 'latest' && <span>{m.updateLatest}</span>}
      {status.kind === 'failed' && <span>{m.updateFailed}</span>}
    </span>
  )
}
