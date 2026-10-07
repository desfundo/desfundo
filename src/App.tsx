import { useCallback, useMemo, useState } from 'react'
import { DropZone } from './components/DropZone'
import { PixDonate } from './components/PixDonate'
import { DehazeMaskModal } from './components/DehazeMaskModal'
import { EraserModal } from './components/EraserModal'
import { VirtualImageGallery } from './components/VirtualImageGallery'
import { useBatchProcessor } from './hooks/useBatchProcessor'
import { CREDITS, donateLinks, LICENSE_NAME, SOURCE_URL } from './config/project'
import { useI18n } from './i18n'
import { downloadAll, downloadOne } from './lib/download'
import type { ProcessedImage } from './types'
import './App.css'

type ActiveEditor =
  | { id: string; kind: 'eraser' }
  | { id: string; kind: 'dehaze' }

export default function App() {
  const { m, lang, setLang } = useI18n()
  const {
    images,
    isProcessing,
    isExpandingPdf,
    pdfStatus,
    defaultAutoRetouch,
    setDefaultAutoRetouch,
    defaultRetouchStrength,
    setDefaultRetouchStrength,
    addFiles,
    removeImage,
    clearAll,
    patchSettings,
    updateResult,
    restoreOriginal,
    processAll,
    reprocess,
    reapplyRetouch,
    applyDefaultsToAll,
    cancel,
    doneCount,
    ensureResult,
    pinResult,
    unpinResult,
  } = useBatchProcessor()

  const resultAccess = useMemo(
    () => ({ ensureResult, pinResult, unpinResult }),
    [ensureResult, pinResult, unpinResult],
  )

  const [activeEditor, setActiveEditor] = useState<ActiveEditor | null>(null)

  const pending = images.filter(
    (i) => i.status === 'queued' || i.status === 'error',
  ).length

  const editingImage = activeEditor
    ? images.find((i) => i.id === activeEditor.id)
    : undefined

  const openEraser = useCallback(
    (id: string) => {
      pinResult(id)
      void (async () => {
        try {
          await ensureResult(id)
          setActiveEditor({ id, kind: 'eraser' })
        } catch {
          unpinResult(id)
        }
      })()
    },
    [ensureResult, pinResult, unpinResult],
  )

  const openDehaze = useCallback(
    (id: string) => {
      pinResult(id)
      void (async () => {
        try {
          await ensureResult(id)
          setActiveEditor({ id, kind: 'dehaze' })
        } catch {
          unpinResult(id)
        }
      })()
    },
    [ensureResult, pinResult, unpinResult],
  )

  const closeEditor = useCallback(() => {
    if (activeEditor) unpinResult(activeEditor.id)
    setActiveEditor(null)
  }, [activeEditor, unpinResult])

  const handleDownloadOne = useCallback(
    (image: ProcessedImage) => {
      void downloadOne(image, resultAccess)
    },
    [resultAccess],
  )

  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const [zipNotice, setZipNotice] = useState<string | null>(null)

  const handleDownloadAll = useCallback(() => {
    setZipNotice(null)
    void (async () => {
      try {
        const report = await downloadAll(images, resultAccess, (done, total) =>
          setZipProgress({ done, total }),
        )
        if (report.failed.length > 0) {
          const names = report.failed.slice(0, 5).join(', ')
          setZipNotice(m.zipPartial(report.exported, names, Math.max(0, report.failed.length - 5)))
        }
      } catch (error) {
        setZipNotice(error instanceof Error ? error.message : m.zipFailed)
      } finally {
        setZipProgress(null)
      }
    })()
  }, [images, resultAccess, m])

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="hero">
        <p className="brand">Desfundo</p>
        <h1>{m.heroTitle}</h1>
        <p className="lede">{m.heroLede}</p>
      </header>

      <main className="workspace">
        <DropZone
          onFiles={addFiles}
          disabled={isProcessing || isExpandingPdf}
        />
        {pdfStatus && (
          <p className="pdf-status" role="status">
            {isExpandingPdf ? m.pdfOpening : ''}
            {pdfStatus}
          </p>
        )}

        {images.length > 0 && (
          <section className="controls" aria-label={m.controlsLabel}>
            <div className="control-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={defaultAutoRetouch}
                  onChange={(e) => setDefaultAutoRetouch(e.target.checked)}
                  disabled={isProcessing}
                />
                <span className="toggle-ui" />
                <span className="toggle-text">
                  <strong>{m.defaultRetouch}</strong>
                  <small>{m.defaultRetouchHint}</small>
                </span>
              </label>

              {defaultAutoRetouch && (
                <label className="strength">
                  <span>{m.defaultStrength}</span>
                  <div className="strength-row">
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={defaultRetouchStrength}
                      onChange={(e) =>
                        setDefaultRetouchStrength(Number(e.target.value))
                      }
                      disabled={isProcessing}
                    />
                    <em>{Math.round(defaultRetouchStrength * 100)}%</em>
                  </div>
                </label>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-compact"
                disabled={isProcessing || images.length === 0}
                onClick={applyDefaultsToAll}
              >
                {m.applyDefaultsToAll}
              </button>
            </div>

            <div className="control-actions">
              <p className="batch-meta">
                {m.batchMeta(images.length, doneCount, pending, isProcessing)}
              </p>

              <div className="btn-row">
                {!isProcessing ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void processAll()}
                    disabled={images.length === 0}
                  >
                    {doneCount > 0 && pending > 0
                      ? m.processPending
                      : m.removeBackgrounds}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={cancel}
                  >
                    {m.cancelQueue}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadAll}
                  disabled={doneCount === 0 || zipProgress !== null}
                  title={
                    doneCount === 0
                      ? m.noneReady
                      : isProcessing
                        ? m.downloadWhileRunning
                        : undefined
                  }
                >
                  {zipProgress
                    ? m.zipProgress(zipProgress.done, zipProgress.total)
                    : doneCount <= 1
                      ? m.downloadDone
                      : m.downloadDoneZip(doneCount)}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearAll}
                >
                  {m.clear}
                </button>
              </div>
            </div>
            {zipNotice && (
              <p className="pdf-status" role="status">
                {zipNotice}
              </p>
            )}
          </section>
        )}

        <VirtualImageGallery
          images={images}
          batchRunning={isProcessing}
          onRemove={removeImage}
          onPatchSettings={patchSettings}
          onRestoreOriginal={restoreOriginal}
          onReprocess={reprocess}
          onReapplyRetouch={reapplyRetouch}
          onOpenEraser={openEraser}
          onOpenDehaze={openDehaze}
          onEnsureResult={ensureResult}
          onPinResult={pinResult}
          onUnpinResult={unpinResult}
          onDownload={handleDownloadOne}
        />
      </main>

      <footer className="foot">
        <p>{m.footerPrivacy}</p>
        <p className="foot-donate">
          {m.footerSupport}{' '}
          <PixDonate />
          {donateLinks(lang).map((link) => (
            <span key={link.url}>
              {' · '}
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </p>
        <details className="foot-about">
          <summary>{m.aboutLicenses}</summary>
          <p>
            {m.freeSoftware(LICENSE_NAME)}{' '}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              {SOURCE_URL.replace('https://', '')}
            </a>
          </p>
          <p>
            {m.madeWith}{' '}
            {CREDITS.map((c, i) => (
              <span key={c.name}>
                {i > 0 && ', '}
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.name}
                </a>{' '}
                ({c.license})
              </span>
            ))}
            {m.fullList}
          </p>
        </details>
        <div className="lang-switch" role="group" aria-label={m.langLabel}>
          {(['pt', 'en'] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </footer>

      {activeEditor?.kind === 'eraser' && editingImage?.resultBlob && (
        <EraserModal
          image={editingImage}
          onClose={closeEditor}
          onSave={updateResult}
        />
      )}

      {activeEditor?.kind === 'dehaze' && editingImage?.resultBlob && (
        <DehazeMaskModal
          image={editingImage}
          initialStrength={editingImage.settings.dehaze || 55}
          onClose={closeEditor}
          onSave={updateResult}
        />
      )}
    </div>
  )
}
