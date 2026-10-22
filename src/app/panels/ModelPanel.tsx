import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Badge, InfoTip } from '../../components/ui'
import { formatBytes, formatNumber } from '../../utils/format'
import type { ModelStats } from '../../types'

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

  const resSummary = stats ? summarizeResolutions(stats.textureDimensions) : null
  const notes = stats ? publishNotes(stats) : []

  return (
    <>
      <div className="tools-panel__header">
        <h1>Modelo</h1>
      </div>
      <div className="tools-panel__body">
        <Section title="Acciones">
          <div className="stack">
            <label className="btn btn--block" style={{ justifyContent: 'center' }}>
              Importar / sustituir modelo
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
              Restaurar modelo original
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
