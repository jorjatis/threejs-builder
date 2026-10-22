import { useEffect } from 'react'
import { SideNav } from './app/SideNav'
import { TopBar } from './app/TopBar'
import { ToolsPanel } from './app/ToolsPanel'
import { ProjectsModal } from './app/ProjectsModal'
import { AppDialogs } from './components/AppDialogs'
import { ModelViewer } from './viewer/ModelViewer'
import { useAppStore } from './store/useAppStore'
import { saveCurrentProject } from './projects/projectActions'

export default function App() {
  const errorMessage = useAppStore((s) => s.errorMessage)
  const setError = useAppStore((s) => s.setError)
  const toastMessage = useAppStore((s) => s.toastMessage)
  const setToast = useAppStore((s) => s.setToast)
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key.toLowerCase() !== 's') return
      e.preventDefault()
      const { hasModel, saveState } = useAppStore.getState()
      if (!hasModel || saveState.saving) return
      void saveCurrentProject()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={`app-shell${sidebarExpanded ? ' app-shell--nav-expanded' : ''}`}>
      <TopBar />
      <div className="workspace">
        <SideNav />
        <ModelViewer />
        <ToolsPanel />
      </div>
      <ProjectsModal />
      <AppDialogs />
      {toastMessage && (
        <div className="toast-ok" role="status">
          {toastMessage}
          <button type="button" className="btn btn--ghost" onClick={() => setToast(null)}>
            Cerrar
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="toast-error" role="alert">
          <div style={{ flex: 1 }}>{errorMessage}</div>
          <button type="button" className="btn btn--ghost" onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
