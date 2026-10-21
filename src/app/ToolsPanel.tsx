import { lazy, Suspense } from 'react'
import { useAppStore } from '../store/useAppStore'

const ModelPanel = lazy(() =>
  import('./panels/ModelPanel').then((m) => ({ default: m.ModelPanel })),
)
const TexturesPanel = lazy(() =>
  import('./panels/TexturesPanel').then((m) => ({ default: m.TexturesPanel })),
)
const OptimizationPanel = lazy(() =>
  import('./panels/OptimizationPanel').then((m) => ({ default: m.OptimizationPanel })),
)
const ScenePanel = lazy(() =>
  import('./panels/ScenePanel').then((m) => ({ default: m.ScenePanel })),
)
const EditorialPanel = lazy(() =>
  import('./panels/EditorialPanel').then((m) => ({ default: m.EditorialPanel })),
)
const PerformancePanel = lazy(() =>
  import('./panels/PerformancePanel').then((m) => ({ default: m.PerformancePanel })),
)
const ExportPanel = lazy(() =>
  import('./panels/ExportPanel').then((m) => ({ default: m.ExportPanel })),
)

function Fallback() {
  return (
    <div className="tools-panel__body">
      <div className="viewer-loading" style={{ position: 'static' }}>
        <span className="spinner" /> Cargando panel…
      </div>
    </div>
  )
}

export function ToolsPanel() {
  const active = useAppStore((s) => s.activePanel)

  return (
    <aside className="tools-panel" aria-label="Herramientas">
      <Suspense fallback={<Fallback />}>
        {active === 'model' && <ModelPanel />}
        {active === 'textures' && <TexturesPanel />}
        {active === 'optimization' && <OptimizationPanel />}
        {active === 'scene' && <ScenePanel />}
        {active === 'editorial' && <EditorialPanel />}
        {active === 'performance' && <PerformancePanel />}
        {active === 'export' && <ExportPanel />}
      </Suspense>
    </aside>
  )
}
