import { useCallback, useMemo, useState } from 'react'
import { DropZone } from './components/DropZone'
import { PixDonate } from './components/PixDonate'
import { DehazeMaskModal } from './components/DehazeMaskModal'
import { EraserModal } from './components/EraserModal'
import { VirtualImageGallery } from './components/VirtualImageGallery'
import { useBatchProcessor } from './hooks/useBatchProcessor'
import { CREDITS, DONATE_LINKS, LICENSE_NAME, SOURCE_URL } from './config/project'
import { downloadAll, downloadOne } from './lib/download'
import type { ProcessedImage } from './types'
import './App.css'

type ActiveEditor =
  | { id: string; kind: 'eraser' }
  | { id: string; kind: 'dehaze' }

export default function App() {
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
          const more = report.failed.length > 5 ? ` e mais ${report.failed.length - 5}` : ''
          setZipNotice(
            `${report.exported} exportada(s). Não foi possível exportar: ${names}${more}.`,
          )
        }
      } catch (error) {
        setZipNotice(error instanceof Error ? error.message : 'Falha ao gerar o ZIP')
      } finally {
        setZipProgress(null)
      }
    })()
  }, [images, resultAccess])

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="hero">
        <p className="brand">Desfundo</p>
        <h1>Remova o fundo de dezenas de imagens de uma vez.</h1>
        <p className="lede">
          Retoque, rotação, espelho, brilho e fundo — tudo ajustável por foto,
          direto no navegador.
        </p>
      </header>

      <main className="workspace">
        <DropZone
          onFiles={addFiles}
          disabled={isProcessing || isExpandingPdf}
        />
        {pdfStatus && (
          <p className="pdf-status" role="status">
            {isExpandingPdf ? 'Abrindo PDF… ' : ''}
            {pdfStatus}
          </p>
        )}

        {images.length > 0 && (
          <section className="controls" aria-label="Padrão para novas imagens">
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
                  <strong>Retoque padrão (novas fotos)</strong>
                  <small>
                    Cada imagem tem o próprio retoque; isto só define o inicial
                  </small>
                </span>
              </label>

              {defaultAutoRetouch && (
                <label className="strength">
                  <span>Intensidade padrão</span>
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
                Aplicar padrão a todas
              </button>
            </div>

            <div className="control-actions">
              <p className="batch-meta">
                {images.length} {images.length === 1 ? 'imagem' : 'imagens'}
                {doneCount > 0 &&
                  ` · ${doneCount} pronta${doneCount === 1 ? '' : 's'}`}
                {pending > 0 &&
                  ` · ${pending} pendente${pending === 1 ? '' : 's'}`}
                {isProcessing && ' · processando…'}
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
                      ? 'Processar pendentes'
                      : 'Remover fundos'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={cancel}
                  >
                    Cancelar fila
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadAll}
                  disabled={doneCount === 0 || zipProgress !== null}
                  title={
                    doneCount === 0
                      ? 'Nenhuma imagem pronta ainda'
                      : isProcessing
                        ? 'Baixa só as já concluídas; a fila continua'
                        : undefined
                  }
                >
                  {zipProgress
                    ? `Gerando ZIP… ${zipProgress.done}/${zipProgress.total}`
                    : doneCount <= 1
                      ? 'Baixar concluídas'
                      : `Baixar concluídas (${doneCount} · ZIP)`}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearAll}
                >
                  Limpar
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
        <p>
          Tudo roda no seu computador — as imagens não são enviadas a nenhum
          servidor.
        </p>
        <p className="foot-donate">
          Desfundo é gratuito. Se ele te ajudou, apoie o projeto:{' '}
          <PixDonate />
          {DONATE_LINKS.map((link) => (
            <span key={link.url}>
              {' · '}
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </p>
        <details className="foot-about">
          <summary>Sobre e licenças</summary>
          <p>
            Software livre sob a licença {LICENSE_NAME}. Código-fonte:{' '}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              {SOURCE_URL.replace('https://', '')}
            </a>
          </p>
          <p>
            Feito com{' '}
            {CREDITS.map((c, i) => (
              <span key={c.name}>
                {i > 0 && ', '}
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.name}
                </a>{' '}
                ({c.license})
              </span>
            ))}
            . Lista completa em THIRD_PARTY_NOTICES.md no repositório.
          </p>
        </details>
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
