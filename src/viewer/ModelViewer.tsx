import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Focus,
  Aperture,
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
import { ArticleFooter, ArticleHeader } from './ArticleChrome'
import { SceneHelpRotate } from './SceneHelp'
import { SceneLoading } from './SceneLoading'
import { getLoremParagraphs } from '../editorial/lorem'
import { getArticlePreviewSize } from '../editorial/previewSizes'
import { useAppStore } from '../store/useAppStore'
import type { ContainerConfig } from '../types'
import { formatBytes, formatPercent, reductionPercent } from '../utils/format'
import { isBackgroundTranslucent } from '../utils/colorAlpha'

/**
 * Tamaño del bloque 3D en el mock.
 * - `vh` / `%` (alto) → relativos al alto del marco (`.abc-device`)
 * - `%` (ancho) → relativo a la columna de contenido (~609px)
 * - `full` (ancho) → vw del marco (rompe la columna, a ancho completo del artículo)
 */
function resolveContainerBox(
  c: ContainerConfig,
  frameWidthPx: number,
  frameHeightPx: number,
  contentWidthPx: number,
  /** Distancia del borde izquierdo del contenido al del marco (≤ 0). */
  fullBleedOffsetPx: number,
): CSSProperties {
  const wVal = Math.max(0, Number(c.widthValue) || 0)
  const hVal = Math.max(0, Number(c.heightValue) || 0)
  const frameW = Math.max(1, frameWidthPx)
  const frameH = Math.max(1, frameHeightPx)
  const contentW = Math.max(1, contentWidthPx)
  const aspect = c.aspectRatio ?? undefined

  const style: CSSProperties = {
    aspectRatio: aspect,
    minHeight: c.minHeight ?? undefined,
    maxHeight: c.maxHeight ?? undefined,
    marginRight: 'auto',
    marginBottom: 24,
  }

  // —— Ancho (siempre centrado) ——
  if (c.widthUnit === 'px') {
    const w = Math.min(wVal, contentW)
    style.width = w
    style.maxWidth = '100%'
    style.marginLeft = 'auto'
  } else if (c.widthUnit === 'full') {
    // Full bleed hasta los bordes del marco (sin provocar scroll X: el device hace clip).
    const w = Math.min((frameW * (wVal || 100)) / 100, 1140, frameW)
    style.width = w
    style.maxWidth = w
    style.marginLeft = fullBleedOffsetPx + (frameW - w) / 2
    style.marginRight = 0
  } else {
    // % de la columna de contenido
    const w = Math.min((contentW * (wVal || 100)) / 100, contentW)
    style.width = w
    style.maxWidth = '100%'
    style.marginLeft = 'auto'
  }

  // —— Alto ——
  if (c.heightUnit === 'auto') {
    style.height = 'auto'
    style.aspectRatio = aspect ?? '16 / 9'
    style.minHeight = c.minHeight ?? 200
  } else if (c.heightUnit === 'px') {
    style.height = hVal
  } else if (c.heightUnit === 'vh' || c.heightUnit === '%') {
    style.height = (frameH * hVal) / 100
  } else {
    style.height = hVal
  }

  return style
}

export function ModelViewer() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const deviceRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [frameSize, setFrameSize] = useState({ w: 1200, h: 600 })
  const [contentWidthPx, setContentWidthPx] = useState(609)
  const [fullBleedOffsetPx, setFullBleedOffsetPx] = useState(0)
  const hasModel = useAppStore((s) => s.hasModel)
  const loadProgress = useAppStore((s) => s.loadProgress)
  const importFiles = useAppStore((s) => s.importFiles)
  const showGrid = useAppStore((s) => s.scene.environment.showGrid)
  const showAxes = useAppStore((s) => s.scene.environment.showAxes)
  const envBackground = useAppStore((s) => s.scene.environment.background)
  const container = useAppStore((s) => s.scene.container)
  const editorialCfg = useAppStore((s) => s.scene.editorial)
  const setScene = useAppStore((s) => s.setScene)
  const setError = useAppStore((s) => s.setError)
  const originalStats = useAppStore((s) => s.originalStats)
  const optimizedSize = useAppStore((s) => s.optimizedSizeBytes)
  const stats = useAppStore((s) => s.stats)
  const viewerMode = useAppStore((s) => s.viewerMode)
  const setViewerMode = useAppStore((s) => s.setViewerMode)
  const articlePreviewWidth = useAppStore((s) => s.articlePreviewWidth)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const setShowProjectsList = useAppStore((s) => s.setShowProjectsList)
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
  /** En editorial: el bloque ha entrado en viewport (o eager). */
  const [stageInView, setStageInView] = useState(true)
  /** En editorial: overlay de carga terminado y canvas visible. */
  const [stageRevealed, setStageRevealed] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const editorial = viewerMode === 'editorial'
  const lazyLoad = editorial && (editorialCfg.lazyLoad ?? false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const viewer = getViewerService()
    let cameraSyncTimer: ReturnType<typeof setTimeout> | null = null
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
        if (cameraSyncTimer) clearTimeout(cameraSyncTimer)
        cameraSyncTimer = setTimeout(() => {
          cameraSyncTimer = null
          useAppStore.getState().syncCameraFromViewer()
        }, 150)
      },
    })
    viewer.mount(el)
    viewer.applySceneConfig(useAppStore.getState().scene, { moveCamera: true })
    useAppStore.getState().syncCameraFromViewer()
    return () => {
      if (cameraSyncTimer) clearTimeout(cameraSyncTimer)
      viewer.setCallbacks({})
      viewer.unmount()
    }
  }, [setError])

  useEffect(() => {
    const t = window.setTimeout(() => getViewerService().resize(), 80)
    return () => window.clearTimeout(t)
  }, [
    viewerMode,
    articlePreviewWidth,
    frameSize.w,
    frameSize.h,
    contentWidthPx,
    container.widthValue,
    container.widthUnit,
    container.heightValue,
    container.heightUnit,
    container.preset,
  ])

  // Medir marco (vw/vh) y columna de contenido (% ancho), no el viewport del navegador.
  useEffect(() => {
    if (!editorial) return
    const device = deviceRef.current
    const body = bodyRef.current
    if (!device) return
    const sync = () => {
      const w = device.clientWidth
      const h = device.clientHeight
      if (w > 0 && h > 0) setFrameSize({ w, h })
      if (body) {
        const cs = getComputedStyle(body)
        const padL = parseFloat(cs.paddingLeft) || 0
        const padR = parseFloat(cs.paddingRight) || 0
        const inner = body.clientWidth - padL - padR
        if (inner > 0) setContentWidthPx(inner)
        const br = body.getBoundingClientRect()
        const dr = device.getBoundingClientRect()
        setFullBleedOffsetPx(dr.left - (br.left + padL))
      }
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(device)
    if (body) ro.observe(body)
    return () => ro.disconnect()
  }, [editorial, articlePreviewWidth])

  // Lazy / eager: cuándo empieza la carga del embed en el mock de artículo.
  useEffect(() => {
    if (!editorial) {
      setStageInView(true)
      setStageRevealed(true)
      return
    }
    if (!lazyLoad) {
      setStageInView(true)
      return
    }
    setStageRevealed(false)
    setStageInView(false)
    const el = stageRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStageInView(true)
          io.disconnect()
        }
      },
      { root: deviceRef.current, threshold: 0.12, rootMargin: '40px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [editorial, lazyLoad, articlePreviewWidth])

  // Overlay «Cargando modelo 3D…» hasta que el modelo esté listo (mín. breve para verlo).
  useEffect(() => {
    if (!editorial || !stageInView) return
    if (loadProgress.active || !hasModel) {
      setStageRevealed(false)
      return
    }
    const t = window.setTimeout(() => {
      setStageRevealed(true)
      window.setTimeout(() => getViewerService().resize(), 40)
    }, 450)
    return () => window.clearTimeout(t)
  }, [editorial, stageInView, loadProgress.active, hasModel, lazyLoad])

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
  const ed = editorialCfg
  const c = container

  const envBg = envBackground
  const previewSize = getArticlePreviewSize(articlePreviewWidth)
  // Siempre el ancho/alto medidos del marco (si el padre es más estrecho que el preset).
  const frameW = Math.max(1, frameSize.w)
  const frameH =
    previewSize.height != null
      ? Math.min(previewSize.height, frameSize.h || previewSize.height)
      : Math.max(1, frameSize.h)

  const stageStyle: CSSProperties | undefined = editorial
    ? {
        ...resolveContainerBox(c, frameW, frameH, contentWidthPx, fullBleedOffsetPx),
        // Mismo fondo que el entorno; si es transparente, blanco de página (sin damero).
        background: isBackgroundTranslucent(envBg) ? '#ffffff' : envBg || '#ffffff',
      }
    : undefined
  const deviceWidthStyle: CSSProperties | undefined = editorial
    ? {
        width: previewSize.width,
        maxWidth: '100%',
        height: previewSize.height ?? '100%',
        maxHeight: '100%',
        overflowX: 'hidden',
        overflowY: 'auto',
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
        {/* Estructura estable: el nodo con wrapRef no se desmonta al cambiar de modo. */}
        <div
          ref={editorial ? deviceRef : undefined}
          className={editorial ? 'abc-device' : 'viewer-area__fill'}
          style={deviceWidthStyle}
        >
          <div className={editorial ? 'abc-article' : 'viewer-area__fill'}>
            {editorial && <ArticleHeader />}
            <div
              ref={editorial ? bodyRef : undefined}
              className={editorial ? 'abc-article__body' : 'viewer-canvas-host'}
            >
              {editorial &&
                ed.textAboveEnabled &&
                getLoremParagraphs(ed.textAboveParagraphs ?? 2).map((p, i) => (
                  <p key={`above-${i}`} className="abc-copy">
                    {p}
                  </p>
                ))}
              <div className={editorial ? 'tjs-scene' : 'viewer-area__fill'}>
                <div
                  ref={editorial ? stageRef : undefined}
                  className={editorial ? 'tjs-scene__c' : 'viewer-area__fill'}
                  style={stageStyle}
                >
                  {editorial &&
                    (stageInView || !lazyLoad) &&
                    (ed.rotateHelpEnabled ?? true) && (
                      <SceneHelpRotate />
                    )}
                  <div
                    className={`viewer-canvas-wrap${
                      !editorial && isBackgroundTranslucent(envBg)
                        ? ' viewer-canvas-wrap--transparent'
                        : ''
                    }${editorial && !stageRevealed ? ' viewer-canvas-wrap--pending' : ''}`}
                    ref={wrapRef}
                  />
                  {editorial && stageInView && !stageRevealed && <SceneLoading />}
                </div>
              </div>
              {editorial &&
                ed.textBelowEnabled &&
                getLoremParagraphs(ed.textBelowParagraphs ?? 2).map((p, i) => (
                  <p key={`below-${i}`} className="abc-copy">
                    {p}
                  </p>
                ))}
            </div>
            {editorial && <ArticleFooter />}
          </div>
        </div>

        {!editorial && (
          <div className="viewer-toolbar" role="toolbar" aria-label="Herramientas del visor">
            <div className="viewer-toolbar__row" role="group" aria-label="Encuadre">
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
                <Aperture size={14} />
              </button>
              <button
                type="button"
                className="btn btn--icon"
                title="Frontal"
                onClick={() => getViewerService().setView('front')}
              >
                <Circle size={14} />
              </button>
              <button
                type="button"
                className="btn btn--icon"
                title="Superior"
                onClick={() => getViewerService().setView('top')}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="btn btn--icon"
                title="Inferior"
                onClick={() => getViewerService().setView('bottom')}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                className="btn btn--icon"
                title="Izquierda"
                onClick={() => getViewerService().setView('left')}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="btn btn--icon"
                title="Derecha"
                onClick={() => getViewerService().setView('right')}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="viewer-toolbar__row" role="group" aria-label="Ver el modelo">
              <button
                type="button"
                className={`btn btn--icon${showGrid ? ' btn--active' : ''}`}
                title="Cuadrícula"
                onClick={() => {
                  const env = useAppStore.getState().scene.environment
                  setScene({ environment: { ...env, showGrid: !showGrid } })
                }}
              >
                <Grid3x3 size={14} />
              </button>
              <button
                type="button"
                className={`btn btn--icon${showAxes ? ' btn--active' : ''}`}
                title="Ejes"
                onClick={() => {
                  const env = useAppStore.getState().scene.environment
                  setScene({ environment: { ...env, showAxes: !showAxes } })
                }}
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

        {loadProgress.active && !editorial && (
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
