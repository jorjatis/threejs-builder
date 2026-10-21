import { useEffect } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function AppDialogs() {
  const confirmDialog = useAppStore((s) => s.confirmDialog)
  const resolveConfirm = useAppStore((s) => s.resolveConfirm)
  const helpOpen = useAppStore((s) => s.helpOpen)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)

  useEffect(() => {
    if (!confirmDialog && !helpOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmDialog) resolveConfirm(false)
      else setHelpOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDialog, helpOpen, resolveConfirm, setHelpOpen])

  return (
    <>
      {confirmDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => resolveConfirm(false)}
        >
          <div
            className="modal modal--sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <h2 id="confirm-title">{confirmDialog.title}</h2>
              <button
                type="button"
                className="btn btn--icon"
                aria-label="Cerrar"
                onClick={() => resolveConfirm(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="modal__body">
              <p className="modal__message">{confirmDialog.message}</p>
            </div>
            <div className="modal__footer modal__footer--actions">
              <button type="button" className="btn" onClick={() => resolveConfirm(false)}>
                {confirmDialog.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className={`btn ${confirmDialog.danger ? 'btn--danger' : 'btn--primary'}`}
                onClick={() => resolveConfirm(true)}
              >
                {confirmDialog.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <h2 id="help-title">
                <HelpCircle size={16} /> Ayuda
              </h2>
              <button
                type="button"
                className="btn btn--icon"
                aria-label="Cerrar"
                onClick={() => setHelpOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="modal__body modal__body--help">
              <p>
                Editor local de modelos <strong>glTF/GLB con opciones editorial para el previsualizado en noticias</strong>:
                importar, optimizar, configurar escena y exportar.
              </p>
              <p>
                Todo corre en el navegador. Los proyectos se guardan en{' '}
                <strong>IndexedDB (local)</strong>; no se suben a ningún servidor.
              </p>
            </div>
            <div className="modal__footer modal__footer--actions">
              <button type="button" className="btn btn--primary" onClick={() => setHelpOpen(false)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
