import { useEffect, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { listProjects, openProject, deleteProject } from '../projects/projectActions'
import { formatBytes } from '../utils/format'
import { Badge } from '../components/ui'

export function ProjectsModal() {
  const open = useAppStore((s) => s.showProjectsList)
  const setShowProjectsList = useAppStore((s) => s.setShowProjectsList)
  const projectsRevision = useAppStore((s) => s.projectsRevision)
  const projectId = useAppStore((s) => s.projectId)
  const dirty = useAppStore((s) => s.saveState.dirty)
  const askConfirm = useAppStore((s) => s.askConfirm)
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof listProjects>>>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void listProjects().then(setProjects)
  }, [open, projectsRevision])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowProjectsList(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setShowProjectsList])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => setShowProjectsList(false)}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id="projects-modal-title">
            <FolderOpen size={16} /> Proyectos guardados
          </h2>
          <button
            type="button"
            className="btn btn--icon"
            title="Cerrar"
            onClick={() => setShowProjectsList(false)}
          >
            <X size={15} />
          </button>
        </div>
        <div className="modal__body">
          {projects.length === 0 ? (
            <p className="muted">Ningún proyecto. Usa «Guardar» con un modelo cargado.</p>
          ) : (
            <div className="project-list">
              {projects.map((p) => {
                const isOpen = projectId === p.id
                return (
                <div
                  key={p.id}
                  className={`project-card project-card--row${isOpen ? ' project-card--open' : ''}`}
                >
                  <div className="project-card__thumb">
                    {p.thumbnailDataUrl ? (
                      <img src={p.thumbnailDataUrl} alt="" />
                    ) : (
                      <span className="dim">3D</span>
                    )}
                  </div>
                  <div className="project-card__info">
                    <div className="project-card__name" title={p.name}>
                      {p.name}
                      {isOpen && (
                        <Badge tone={dirty ? 'lossy' : 'ok'}>
                          {dirty ? 'abierto · sin guardar' : 'abierto'}
                        </Badge>
                      )}
                    </div>
                    <div className="project-card__meta">{p.fileName}</div>
                    <div className="project-card__meta">
                      {new Date(p.modifiedAt).toLocaleString('es-ES')}
                      {p.originalSizeBytes ? ` · ${formatBytes(p.originalSizeBytes)}` : ''}
                    </div>
                  </div>
                  <div className="project-card__actions">
                    <button
                      type="button"
                      className={`btn${isOpen ? '' : ' btn--primary'}`}
                      disabled={busyId !== null || isOpen}
                      onClick={() => {
                        setBusyId(p.id)
                        void openProject(p.id)
                          .then(() => setShowProjectsList(false))
                          .finally(() => setBusyId(null))
                      }}
                    >
                      {busyId === p.id ? 'Abriendo…' : isOpen ? 'Actual' : 'Abrir'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={busyId !== null}
                      title="Eliminar"
                      onClick={() => {
                        void askConfirm({
                          title: 'Eliminar proyecto',
                          message: `¿Eliminar «${p.name}» de IndexedDB?`,
                          confirmLabel: 'Eliminar',
                          danger: true,
                        }).then((ok) => {
                          if (!ok) return
                          void deleteProject(p.id).then(() => listProjects().then(setProjects))
                        })
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
        <div className="modal__footer">
          <Badge>local</Badge>
          <span className="dim">IndexedDB</span>
        </div>
      </div>
    </div>
  )
}
