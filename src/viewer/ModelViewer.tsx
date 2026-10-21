import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Focus,
  RotateCcw,
  Grid3x3,
  Axis3d,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  BoxSelect,
  Spline,
  Newspaper,
  Box,
  FolderOpen,
  Columns2,
} from 'lucide-react'
import { getViewerService } from './ViewerService'
import { useAppStore } from '../store/useAppStore'
import { formatBytes, formatPercent, reductionPercent } from '../utils/format'

export function ModelViewer() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hasModel = useAppStore((s) => s.hasModel)
  const loadProgress = useAppStore((s) => s.loadProgress)
  const importFiles = useAppStore((s) => s.importFiles)
  const scene = useAppStore((s) => s.scene)
  const setScene = useAppStore((s) => s.setScene)
  const setError = useAppStore((s) => s.setError)
  const originalStats = useAppStore((s) => s.originalStats)
  const optimizedSize = useAppStore((s) => s.optimizedSizeBytes)
  const stats = useAppStore((s) => s.stats)
  const viewerMode = useAppStore((s) => s.viewerMode)
  const setViewerMode = useAppStore((s) => s.setViewerMode)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const setShowProjectsList = useAppStore((s) => s.setShowProjectsList)
  const projectName = useAppStore((s) => s.projectName)
  const compareSide = useAppStore((s) => s.compareSide)
  const setCompareSide = useAppStore((s) => s.setCompareSide)
  const appliedOps = useAppStore((s) => s.appliedOps)
  const canCompare =
    hasModel &&
    (appliedOps.length > 0 ||
      (originalStats != null &&
        stats != null &&
        (originalStats.fileSizeBytes !== stats.fileSizeBytes ||
          originalStats.triangles.value !== stats.triangles.value)))
  const [fileDragging, setFileDragging] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [vertices, setVertices] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const editorial = viewerMode === 'editorial'

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const viewer = getViewerService()
    viewer.setCallbacks({
      onContextLost: () =>
        setError('Se perdió el contexto WebGL. Recarga la página o libera memoria del navegador.'),
      onStatsMeasured: (data) => {
        const current = useAppStore.getState().stats
        if (!current) return
        useAppStore.setState({
          stats: {
            ...current,
            drawCalls: { value: data.drawCalls, confidence: 'exact' },
          },
        })
      },
      onCameraChange: () => {
        useAppStore.getState().syncCameraFromViewer()
      },
    })
    viewer.mount(el)
    viewer.applySceneConfig(useAppStore.getState().scene, { moveCamera: true })
    useAppStore.getState().syncCameraFromViewer()
  }, [setError])

  useEffect(() => {
    const t = window.setTimeout(() => getViewerService().resize(), 80)
    return () => window.clearTimeout(t)
  }, [viewerMode, scene.container.widthValue, scene.container.heightValue, scene.container.preset])

  useEffect(() => {
    const area = wrapRef.current?.closest('.viewer-shell') as HTMLElement | null
    if (!area) return
    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      setFileDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      if (e.relatedTarget && area.contains(e.relatedTarget as Node)) return
      setFileDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      setFileDragging(false)
      if (e.dataTransfer?.files?.length) void importFiles(e.dataTransfer.files)
    }
    area.addEventListener('dragover', onDragOver)
    area.addEventListener('dragleave', onDragLeave)
    area.addEventListener('drop', onDrop)
    return () => {
      area.removeEventListener('dragover', onDragOver)
      area.removeEventListener('dragleave', onDragLeave)
      area.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  const originalSize = originalStats?.fileSizeBytes ?? 0
  const currentSize = optimizedSize ?? stats?.fileSizeBytes ?? 0
  const reduction = originalSize > 0 ? reductionPercent(originalSize, currentSize) : 0
  const ed = scene.editorial
  const c = scene.container

  const stageStyle: CSSProperties | undefined = editorial
    ? {
        width: c.widthUnit === 'px' ? Math.min(c.widthValue || 640, 720) : '100%',
        maxWidth: c.maxWidth ?? '100%',
        height:
          c.heightUnit === 'px'
            ? Math.min(c.heightValue || 420, 480)
            : c.heightUnit === 'vh'
              ? `${Math.min(c.heightValue, 55)}vh`
              : 360,
        aspectRatio: c.aspectRatio ?? undefined,
        background: c.background || '#d0d0d4',
      }
    : undefined

  return (
    <div className={`viewer-shell${editorial ? ' viewer-shell--editorial' : ''}`}>
      <div className="viewer-mode-bar">
        <button
          type="button"
          className={`btn btn--chip${viewerMode === '3d' ? ' btn--active' : ''}`}
          onClick={() => setViewerMode('3d')}
        >
          <Box size={13} /> Visor 3D
        </button>
        <button
          type="button"
          className={`btn btn--chip${editorial ? ' btn--active' : ''}`}
          onClick={() => {
            setViewerMode('editorial')
            setActivePanel('editorial')
          }}
        >
          <Newspaper size={13} /> Vista artículo
        </button>
      </div>

      <div className={`viewer-area${editorial ? ' viewer-area--article' : ''}`}>
        {editorial && (
          <header className="article-frame__masthead">
            <span className="article-frame__burger" />
            <strong className="article-frame__logo">DIARIO</strong>
            <span className="article-frame__user">Vista previa</span>
          </header>
        )}

        {editorial && (
          <div className="article-frame__copy article-frame__copy--top">
            {ed.titleEnabled && (
              <h1 className="article-frame__title">{ed.title || projectName}</h1>
            )}
            {ed.leadEnabled && (
              <p className="article-frame__lead">{ed.lead || 'Entradilla del reportaje…'}</p>
            )}
            {ed.textAboveEnabled && (
              <p className="article-frame__p">{ed.textAbove || 'Texto superior…'}</p>
            )}
            <div className="article-frame__hint">360° · NAVEGA POR EL 3D</div>
          </div>
        )}

        <div
          className={editorial ? 'article-frame__stage' : 'viewer-canvas-host'}
          style={stageStyle}
        >
          <div className="viewer-canvas-wrap" ref={wrapRef} />
        </div>

        {editorial && (
          <div className="article-frame__copy article-frame__copy--bottom">
            {ed.captionEnabled && (
              <p className="article-frame__caption">{ed.caption || 'Pie de imagen'}</p>
            )}
            {ed.textBelowEnabled && (
              <p className="article-frame__p">{ed.textBelow || 'Texto inferior…'}</p>
            )}
            {ed.creditsEnabled && (
              <p className="article-frame__credits">{ed.credits || 'Créditos'}</p>
            )}
          </div>
        )}

        {!editorial && (
          <div className="viewer-toolbar">
            <button
              type="button"
              className="btn btn--icon"
              title="Centrar / encuadrar"
              onClick={() => {
                getViewerService().fitCameraToModel()
              }}
            >
              <Focus size={14} />
            </button>
            <button
              type="button"
              className="btn btn--icon"
              title="Volver al encuadre guardado"
              onClick={() => getViewerService().resetCamera()}
            >
              <RotateCcw size={14} />
            </button>
            <button type="button" className="btn btn--icon" title="Frontal" onClick={() => getViewerService().setView('front')}>
              <Circle size={14} />
            </button>
            <button type="button" className="btn btn--icon" title="Superior" onClick={() => getViewerService().setView('top')}>
              <ChevronUp size={14} />
            </button>
            <button type="button" className="btn btn--icon" title="Inferior" onClick={() => getViewerService().setView('bottom')}>
              <ChevronDown size={14} />
            </button>
            <button type="button" className="btn btn--icon" title="Izquierda" onClick={() => getViewerService().setView('left')}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="btn btn--icon" title="Derecha" onClick={() => getViewerService().setView('right')}>
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className={`btn btn--icon${scene.environment.showGrid ? ' btn--active' : ''}`}
              title="Cuadrícula"
              onClick={() =>
                setScene({
                  environment: { ...scene.environment, showGrid: !scene.environment.showGrid },
                })
              }
            >
              <Grid3x3 size={14} />
            </button>
            <button
              type="button"
              className={`btn btn--icon${scene.environment.showAxes ? ' btn--active' : ''}`}
              title="Ejes"
              onClick={() =>
                setScene({
                  environment: { ...scene.environment, showAxes: !scene.environment.showAxes },
                })
              }
            >
              <Axis3d size={14} />
            </button>
            <button
              type="button"
              className={`btn btn--icon${wireframe ? ' btn--active' : ''}`}
              title="Wireframe"
              disabled={!hasModel}
              onClick={() => {
                const next = !wireframe
                setWireframe(next)
                getViewerService().setWireframe(next)
              }}
            >
              <BoxSelect size={14} />
            </button>
            <button
              type="button"
              className={`btn btn--icon${vertices ? ' btn--active' : ''}`}
              title="Vértices"
              disabled={!hasModel}
              onClick={() => {
                const next = !vertices
                setVertices(next)
                getViewerService().setShowVertices(next)
              }}
            >
              <Spline size={14} />
            </button>
            {canCompare && (
              <button
                type="button"
                className={`btn btn--icon${compareSide === 'before' ? ' btn--active' : ''}`}
                title={
                  compareSide === 'before'
                    ? 'Volver al modelo actual'
                    : 'Ver original (comparar)'
                }
                onClick={() => {
                  void setCompareSide(compareSide === 'before' ? 'off' : 'before')
                }}
              >
                <Columns2 size={14} />
              </button>
            )}
          </div>
        )}

        {compareSide === 'before' && !editorial && (
          <div className="viewer-compare-badge" aria-live="polite">
            Original
          </div>
        )}

        {!hasModel && !editorial && (
          <div className="viewer-empty">
            <div className="viewer-empty__card">
              <h2>Importa un modelo 3D</h2>
              <p>
                Arrastra un <strong>.glb</strong> o <strong>.gltf</strong> aquí, o abre un proyecto guardado.
              </p>
              <div className="viewer-empty__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => fileRef.current?.click()}
                >
                  Abrir archivo
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowProjectsList(true)}
                >
                  <FolderOpen size={14} /> Proyectos guardados
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".glb,.gltf"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void importFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}

        {fileDragging && (
          <div className="viewer-drop viewer-drop--active">Suelta el modelo para importarlo</div>
        )}

        {loadProgress.active && (
          <div className="viewer-loading">
            <span className="spinner" />
            <span>{loadProgress.message}</span>
          </div>
        )}
      </div>

      {hasModel && (
        <div className="viewer-status">
          <div className="viewer-status__item">
            <span className="viewer-status__label">Original</span>
            <span className="viewer-status__value">
              {originalSize > 0 ? formatBytes(originalSize) : '—'}
            </span>
          </div>
          <div className="viewer-status__item">
            <span className="viewer-status__label">Actual</span>
            <span className="viewer-status__value">
              {currentSize > 0 ? formatBytes(currentSize) : '—'}
            </span>
          </div>
          <div className="viewer-status__item">
            <span className="viewer-status__label">Δ</span>
            <span className="viewer-status__value">
              {originalSize > 0 ? formatPercent(reduction) : '—'}
            </span>
          </div>
          <div className="viewer-status__item">
            <span className="viewer-status__label">Tris</span>
            <span className="viewer-status__value">
              {originalStats?.triangles.value != null
                ? originalStats.triangles.value.toLocaleString('es-ES')
                : '—'}
              {' → '}
              {stats?.triangles.value != null
                ? stats.triangles.value.toLocaleString('es-ES')
                : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
