import { FolderOpen, Save, Download, Undo2, Redo2, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { saveCurrentProject } from '../projects/projectActions'

export function TopBar() {
  const projectName = useAppStore((s) => s.projectName)
  const setProjectName = useAppStore((s) => s.setProjectName)
  const dirty = useAppStore((s) => s.saveState.dirty)
  const saving = useAppStore((s) => s.saveState.saving)
  const projectId = useAppStore((s) => s.projectId)
  const importFiles = useAppStore((s) => s.importFiles)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  const historyIndex = useAppStore((s) => s.historyIndex)
  const historyLen = useAppStore((s) => s.history.length)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const setShowProjectsList = useAppStore((s) => s.setShowProjectsList)
  const hasModel = useAppStore((s) => s.hasModel)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <header className="topbar">
      <span
        className={`save-dot${dirty ? ' save-dot--dirty' : ''}`}
        title={dirty ? 'Cambios sin guardar' : 'Guardado'}
      />
      <div className="topbar__title">
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          aria-label="Nombre del proyecto"
        />
        {hasModel && (
          <span className={`topbar__save-label${dirty ? ' topbar__save-label--dirty' : ''}`}>
            {saving ? 'Guardando…' : dirty ? 'Sin guardar' : projectId ? 'Guardado' : 'Nuevo'}
          </span>
        )}
      </div>
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        <button
          type="button"
          className="btn btn--icon"
          title="Deshacer"
          disabled={historyIndex <= 0}
          onClick={() => void undo()}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          title="Rehacer"
          disabled={historyIndex >= historyLen - 1}
          onClick={() => void redo()}
        >
          <Redo2 size={15} />
        </button>
        <button
          type="button"
          className="btn"
          title="Importar modelo"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} />
          Importar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn"
          title="Guardar proyecto (Ctrl+S)"
          disabled={!hasModel || saving}
          onClick={() => void saveCurrentProject()}
        >
          <Save size={14} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          className="btn btn--icon"
          title="Proyectos guardados"
          onClick={() => setShowProjectsList(true)}
        >
          <FolderOpen size={15} />
        </button>
        <button
          type="button"
          className="btn btn--primary"
          title="Ir a exportación"
          onClick={() => setActivePanel('export')}
        >
          <Download size={14} />
          Exportar
        </button>
      </div>
    </header>
  )
}
