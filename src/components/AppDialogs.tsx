import { HelpCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AppModal } from './ui'

export function AppDialogs() {
  const confirmDialog = useAppStore((s) => s.confirmDialog)
  const resolveConfirm = useAppStore((s) => s.resolveConfirm)
  const helpOpen = useAppStore((s) => s.helpOpen)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)

  return (
    <>
      <AppModal
        open={!!confirmDialog}
        onClose={() => resolveConfirm(false)}
        title={confirmDialog?.title ?? ''}
        size="sm"
        role="alertdialog"
        footer={
          <>
            <button type="button" className="btn" onClick={() => resolveConfirm(false)}>
              {confirmDialog?.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              type="button"
              className={`btn ${confirmDialog?.danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => resolveConfirm(true)}
            >
              {confirmDialog?.confirmLabel ?? 'Confirmar'}
            </button>
          </>
        }
      >
        <p className="modal__message">{confirmDialog?.message}</p>
      </AppModal>

      <AppModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={
          <>
            <HelpCircle size={16} /> Info
          </>
        }
        bodyClassName="modal__body--help"
        footer={
          <button type="button" className="btn btn--primary" onClick={() => setHelpOpen(false)}>
            Entendido
          </button>
        }
      >
        <p>
          Editor local de modelos <strong>glTF/GLB con opciones editorial para el previsualizado en noticias</strong>:
          importar, optimizar, configurar escena y exportar.
        </p>
        <p>
          Todo corre en el navegador. Los proyectos se guardan en{' '}
          <strong>IndexedDB (local)</strong>; no se suben a ningún servidor.
        </p>
      </AppModal>
    </>
  )
}
