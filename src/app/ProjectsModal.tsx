import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { listProjects, openProject, deleteProject } from '../projects/projectActions'
import { formatBytes } from '../utils/format'
import { AppModal, Badge } from '../components/ui'

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

  return (
    <AppModal
      open={open}
      onClose={() => setShowProjectsList(false)}
      title={
        <>
          <FolderOpen size={16} /> Proyectos guardados
        </>
      }
      footerClassName="modal__footer"
      footer={
        <>
          <Badge>local</Badge>
          <span className="dim">IndexedDB</span>
        </>
      }
    >
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
                    {p.workingSizeBytes ? ` · ${formatBytes(p.workingSizeBytes)}` : ''}
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
            )
          })}
        </div>
      )}
    </AppModal>
  )
}
