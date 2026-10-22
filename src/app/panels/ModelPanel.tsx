import { useState } from 'react'
import { FolderOpen, RotateCcw, Upload, WandSparkles } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Badge, InfoTip, Collapse } from '../../components/ui'
import { formatBytes, formatNumber } from '../../utils/format'
import type { ModelStats } from '../../types'
import {
  GLOBAL_PRESETS,
  buildGlobalPresetOptimization,
  type GlobalPreset,
} from '../../presets/globalPresets'
import { getViewerService } from '../../viewer/ViewerService'
import { runOptimization, settingsToSteps } from '../../optimization/runOptimization'
import { formatPipelineJson } from '../../optimization/presets'
import { getModelSession } from '../../store/modelSession'
import { extractTextureInventory } from '../../textures/extractTextures'

function Stat({
  label,
  value,
  meta,
}: {
  label: string
  value: string
  meta?: string
}) {
  return (
    <div className="stat-item">
      <div className="stat-item__label">{label}</div>
      <div className="stat-item__value">{value}</div>
      {meta ? <div className="stat-item__meta">{meta}</div> : null}
    </div>
  )
}

function summarizeResolutions(dims: ModelStats['textureDimensions']): string | null {
  if (!dims.length) return null
  const counts = new Map<string, number>()
  for (const d of dims) {
    const key = `${d.width}×${d.height}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([size, n]) => (n > 1 ? `${n}× ${size}` : size))
    .join(' · ')
}

/** Traduce extensiones glTF a avisos cortos en español. */
function publishNotes(stats: ModelStats): string[] {
  const notes: string[] = []
  const ext = stats.extensions
  if (ext.includes('KHR_draco_mesh_compression')) {
    notes.push(
      'Compresión Draco (KHR_draco_mesh_compression): al publicar hay que cargar DRACOLoader.',
    )
  }
  if (ext.includes('EXT_meshopt_compression')) {
    notes.push(
      'Compresión Meshopt (EXT_meshopt_compression): al publicar hay que cargar MeshoptDecoder.',
    )
  }
  const matExt = ext.filter((e) => e.startsWith('KHR_materials_'))
  if (matExt.length) {
    const names = matExt
      .map((e) => {
        const short = e.replace('KHR_materials_', '')
        return `${short} · ${e}`
      })
      .join('; ')
    notes.push(`Materiales avanzados (${names}): el visor web debe soportarlos.`)
  }
  return notes
}

export function ModelPanel() {
  const stats = useAppStore((s) => s.stats)
  const hasModel = useAppStore((s) => s.hasModel)
  const importFiles = useAppStore((s) => s.importFiles)
  const restoreOriginal = useAppStore((s) => s.restoreOriginal)
  const askConfirm = useAppStore((s) => s.askConfirm)
  const setShowProjectsList = useAppStore((s) => s.setShowProjectsList)
  const setScene = useAppStore((s) => s.setScene)
  const setBudget = useAppStore((s) => s.setBudget)
  const setOptimization = useAppStore((s) => s.setOptimization)
  const setPipelineSource = useAppStore((s) => s.setPipelineSource)
  const setActiveGlobalPresetId = useAppStore((s) => s.setActiveGlobalPresetId)
  const activeGlobalPresetId = useAppStore((s) => s.activeGlobalPresetId)
  const setActivePresetId = useAppStore((s) => s.setActivePresetId)
  const syncCameraFromViewer = useAppStore((s) => s.syncCameraFromViewer)
  const reloadViewerFromWorking = useAppStore((s) => s.reloadViewerFromWorking)
  const pushConsole = useAppStore((s) => s.pushConsole)
  const setTextures = useAppStore((s) => s.setTextures)
  const setIsOptimizing = useAppStore((s) => s.setIsOptimizing)
  const isOptimizing = useAppStore((s) => s.isOptimizing)
  const setToast = useAppStore((s) => s.setToast)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const resSummary = stats ? summarizeResolutions(stats.textureDimensions) : null
  const notes = stats ? publishNotes(stats) : []

  async function applyGlobalPreset(preset: GlobalPreset) {
    if (!hasModel) {
      setToast('Importa un modelo antes de aplicar un preset global.')
      return
    }
    const ok = await askConfirm({
      title: preset.name,
      message: `${preset.description}\n\nSe ajustará la escena (sin zoom/pan, fondo transparente), el encuadre tipo artículo y se optimizará desde el original (texturas ≤512, Meshopt). ¿Continuar?`,
      confirmLabel: 'Aplicar preset',
    })
    if (!ok) return

    setApplyingId(preset.id)
    setIsOptimizing(true)
    pushConsole({ level: 'info', message: `▶ Preset global «${preset.name}»` })

    try {
      const nextOpt = buildGlobalPresetOptimization(
        preset,
        useAppStore.getState().optimization,
      )
      setOptimization(nextOpt)
      setPipelineSource(
        formatPipelineJson({
          name: preset.name,
          steps: settingsToSteps(nextOpt),
        }),
      )
      setBudget(preset.budget)

      // Escena: interacción, entorno transparente, límites de cámara
      const curScene = useAppStore.getState().scene
      setScene({
        ...(preset.scene.environment
          ? { environment: { ...curScene.environment, ...preset.scene.environment } }
          : {}),
        ...(preset.scene.container
          ? { container: { ...curScene.container, ...preset.scene.container } }
          : {}),
        ...(preset.scene.interaction
          ? { interaction: { ...curScene.interaction, ...preset.scene.interaction } }
          : {}),
        ...(preset.scene.autoRotate
          ? { autoRotate: { ...curScene.autoRotate, ...preset.scene.autoRotate } }
          : {}),
        ...(preset.scene.camera
          ? { camera: { ...curScene.camera, ...preset.scene.camera } }
          : {}),
      })
      setActivePresetId(null)
      setActiveGlobalPresetId(preset.id)

      const viewer = getViewerService()
      viewer.applySceneConfig(useAppStore.getState().scene, { moveCamera: false })
      viewer.fitCameraToModel({ style: 'editorial', resetLimits: false })
      viewer.rememberCamera()
      syncCameraFromViewer()

      const result = await runOptimization(
        nextOpt,
        settingsToSteps(nextOpt),
        {
          onLog: (level, message, details) => pushConsole({ level, message, details }),
        },
        'original',
      )

      useAppStore.setState({
        stats: result.stats,
        optimizedSizeBytes: result.glb.byteLength,
        appliedOps: result.appliedOps,
        saveState: { ...useAppStore.getState().saveState, dirty: true },
      })

      await reloadViewerFromWorking()
      // Reaplicar encuadre editorial tras la recarga (preserva framing bookmark + vista)
      viewer.applySceneConfig(useAppStore.getState().scene, { moveCamera: false })
      viewer.fitCameraToModel({ style: 'editorial' })
      viewer.rememberCamera()
      syncCameraFromViewer()

      const session = getModelSession()
      if (session?.document) {
        setTextures(await extractTextureInventory(session.document))
      }
      pushConsole({
        level: 'success',
        message: `Preset «${preset.name}» aplicado`,
        durationMs: result.durationMs,
        details: formatBytes(result.glb.byteLength),
      })
      setToast(`Preset «${preset.name}» aplicado. Guarda el proyecto para conservarlo.`)
      window.setTimeout(() => {
        if (useAppStore.getState().toastMessage?.startsWith('Preset «')) {
          useAppStore.getState().setToast(null)
        }
      }, 3200)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al aplicar el preset'
      useAppStore.getState().setError(message)
      pushConsole({ level: 'error', message })
    } finally {
      setApplyingId(null)
      setIsOptimizing(false)
    }
  }

  return (
    <>
      <div className="tools-panel__header">
        <h1>Modelo</h1>
      </div>
      <div className="tools-panel__body">
        {hasModel && (
          <Collapse
            title={
              <>
                <WandSparkles className="collapse__title-icon" size={14} aria-hidden />
                Presets globales
              </>
            }
            defaultOpen
          >
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
              Atajos para embebidos en web: sin zoom (no roba el scroll), sin pan, fondo
              transparente y peso acotado.
            </p>
            <div className="preset-list">
              {GLOBAL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-item${activeGlobalPresetId === p.id ? ' preset-item--active' : ''}`}
                  disabled={isOptimizing}
                  onClick={() => void applyGlobalPreset(p)}
                >
                  <strong>
                    {applyingId === p.id ? 'Aplicando…' : p.name}
                  </strong>
                  <span className="dim">{p.description}</span>
                </button>
              ))}
            </div>
          </Collapse>
        )}

        <Section title="Acciones">
          <div className="stack">
            <label className="btn btn--block" style={{ justifyContent: 'center' }}>
              <Upload size={14} /> Importar / sustituir modelo
              <input
                type="file"
                accept=".glb,.gltf"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void importFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn--block"
              disabled={!hasModel}
              onClick={() => {
                void askConfirm({
                  title: 'Restaurar original',
                  message:
                    'Se descartan optimizaciones y cambios del modelo de trabajo. ¿Continuar?',
                  confirmLabel: 'Restaurar',
                  danger: true,
                }).then((ok) => {
                  if (ok) void restoreOriginal()
                })
              }}
            >
              <RotateCcw size={14} /> Restaurar modelo original
            </button>
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setShowProjectsList(true)}
            >
              <FolderOpen size={14} /> Abrir proyectos guardados
            </button>
          </div>
        </Section>

        {stats ? (
          <Section title="Estadísticas">
            <div className="stat-grid">
              <Stat label="Archivo" value={stats.fileName} />
              <Stat label="Tamaño" value={formatBytes(stats.fileSizeBytes)} />
              <Stat label="Formato" value={stats.format.toUpperCase()} />
              <Stat label="Triángulos" value={formatNumber(stats.triangles.value)} />
              <Stat label="Vértices" value={formatNumber(stats.vertices.value)} />
              <Stat label="Mallas" value={formatNumber(stats.meshes.value)} />
              <Stat label="Materiales" value={formatNumber(stats.materials.value)} />
              <Stat label="Texturas" value={formatNumber(stats.textures.value)} />
              <Stat label="Animaciones" value={formatNumber(stats.animations.value)} />
              <Stat
                label="Draw calls"
                value={formatNumber(stats.drawCalls.value)}
                meta={stats.drawCalls.confidence === 'exact' ? 'medidos en el visor' : 'pendiente'}
              />
            </div>

            {(resSummary || notes.length > 0) && (
              <div className="model-notes">
                {resSummary && (
                  <div className="model-notes__row">
                    <span className="model-notes__label">
                      Tamaños de textura
                      <InfoTip text="Resolución de cada mapa del modelo. Si son muy grandes, baja el peso en el panel Texturas." />
                    </span>
                    <span>{resSummary}</span>
                  </div>
                )}
                {notes.map((n) => (
                  <div key={n} className="model-notes__row model-notes__row--warn">
                    {n}
                  </div>
                ))}
              </div>
            )}
          </Section>
        ) : (
          <p className="muted">Importa un modelo para ver estadísticas.</p>
        )}

        <p className="dim" style={{ marginTop: 12 }}>
          <Badge>local</Badge> Guardado en este navegador (IndexedDB)
        </p>
      </div>
    </>
  )
}
