import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Field, TextInput, Select, Switch, Badge } from '../../components/ui'
import { getModelSession } from '../../store/modelSession'
import { exportModelDocument, triggerDownload } from '../../export/exportModel'
import { generateJsModule } from '../../export/generateJsModule'
import { exportFullPackage } from '../../export/exportPackage'
import { copyText } from '../../utils/download'
import { formatBytes } from '../../utils/format'

export function ExportPanel() {
  const hasModel = useAppStore((s) => s.hasModel)
  const settings = useAppStore((s) => s.exportSettings)
  const setExportSettings = useAppStore((s) => s.setExportSettings)
  const scene = useAppStore((s) => s.scene)
  const projectName = useAppStore((s) => s.projectName)
  const originalStats = useAppStore((s) => s.originalStats)
  const stats = useAppStore((s) => s.stats)
  const appliedOps = useAppStore((s) => s.appliedOps)
  const setGeneratedCode = useAppStore((s) => s.setGeneratedCode)
  const generatedCode = useAppStore((s) => s.generatedCode)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const modulePreview = useMemo(() => {
    const modelName = `${settings.fileName}.${settings.format === 'glb' ? 'glb' : 'gltf'}`
    return generateJsModule(settings.jsMode, scene, modelName)
  }, [settings.fileName, settings.format, settings.jsMode, scene])

  async function exportModel() {
    const session = getModelSession()
    if (!session?.document) return
    setBusy(true)
    setStatus(null)
    try {
      const result = await exportModelDocument(session.document, settings.format, settings.fileName)
      if (!result.valid) {
        setStatus(`Validación: ${result.validationMessage}`)
        useAppStore.getState().setError(result.validationMessage)
        return
      }
      triggerDownload(result)
      setStatus(`${result.fileName} · ${formatBytes(result.sizeBytes)} · ${result.validationMessage}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useAppStore.getState().setError(msg)
      setStatus(msg)
    } finally {
      setBusy(false)
    }
  }

  function previewJs() {
    setGeneratedCode(modulePreview.code)
    setStatus(`Módulo ${modulePreview.fileName} generado (vista previa).`)
  }

  async function downloadJs() {
    previewJs()
    const blob = new Blob([modulePreview.code], { type: 'text/javascript' })
    const { downloadBlob } = await import('../../utils/download')
    downloadBlob(blob, modulePreview.fileName)
  }

  async function exportZip() {
    const session = getModelSession()
    if (!session?.document) return
    setBusy(true)
    try {
      await exportFullPackage({
        document: session.document,
        settings,
        scene,
        projectName,
        originalStats,
        currentStats: stats,
        originalSize: session.originalSizeBytes,
        currentSize: session.workingGlb.byteLength,
        appliedOps,
      })
      setStatus('Paquete ZIP descargado.')
    } catch (err) {
      useAppStore.getState().setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="tools-panel__header">
        <h1>Exportación</h1>
      </div>
      <div className="tools-panel__body">
        {!hasModel && <p className="muted">Importa y (opcionalmente) optimiza un modelo primero.</p>}

        <Section title="Opciones generales">
          <Field label="Nombre de archivo">
            <TextInput
              value={settings.fileName}
              onChange={(e) => setExportSettings({ fileName: e.target.value })}
            />
          </Field>
          <p className="dim">
            Ops aplicadas: {appliedOps.length ? appliedOps.join(', ') : 'ninguna'} · Tamaño actual:{' '}
            {stats ? formatBytes(stats.fileSizeBytes) : '—'}
          </p>
        </Section>

        <Section title="1. Modelo 3D">
          <Field label="Formato">
            <Select
              value={settings.format}
              onChange={(e) =>
                setExportSettings({ format: e.target.value as 'glb' | 'gltf' })
              }
            >
              <option value="glb">GLB (embebido)</option>
              <option value="gltf">glTF + recursos (ZIP)</option>
            </Select>
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!hasModel || busy}
            onClick={() => void exportModel()}
          >
            Exportar modelo
          </button>
        </Section>

        <Section title="2. Módulo JavaScript">
          <Field label="Modo">
            <Select
              value={settings.jsMode}
              onChange={(e) =>
                setExportSettings({ jsMode: e.target.value as 'integrate' | 'standalone' })
              }
            >
              <option value="integrate">A — Integrar en escena existente</option>
              <option value="standalone">B — Escena independiente</option>
            </Select>
          </Field>
          <p className="muted" style={{ marginBottom: 8 }}>
            {settings.jsMode === 'integrate'
              ? 'No crea renderer ni rAF propios. Expone createModelScene({ scene, camera, ... }).'
              : 'Crea renderer, cámara y controles. Expone createModelViewer(container, config).'}
          </p>
          <p className="dim" style={{ marginBottom: 8 }}>
            Dependencias: {modulePreview.dependencies.join(', ')}
          </p>
          <div className="stack">
            <button type="button" className="btn" disabled={!hasModel} onClick={previewJs}>
              Vista previa del código
            </button>
            <button type="button" className="btn" disabled={!hasModel} onClick={() => void downloadJs()}>
              <Save size={14} />
              Descargar módulo
            </button>
            <button
              type="button"
              className="btn"
              disabled={!generatedCode}
              onClick={() => void copyText(generatedCode || '')}
            >
              Copiar código
            </button>
          </div>
          {generatedCode && (
            <pre className="code-preview" style={{ marginTop: 8 }}>
              {generatedCode}
            </pre>
          )}
          <details style={{ marginTop: 8 }}>
            <summary className="muted">Instrucciones de integración</summary>
            <pre className="code-preview">{modulePreview.instructions}</pre>
          </details>
        </Section>

        <Section title="3. Paquete completo (ZIP)">
          <div className="export-options">
            {(
              [
                ['includeModel', 'Incluir modelo'],
                ['includeJsModule', 'Incluir módulo JS'],
                ['includeReadme', 'Incluir README'],
                ['includeExample', 'Incluir ejemplo'],
                ['includeReport', 'Incluir informe'],
              ] as const
            ).map(([key, label]) => (
              <div className="switch-row" key={key}>
                <Switch
                  checked={settings[key]}
                  onChange={(v) => setExportSettings({ [key]: v })}
                />
                <div className="switch-row__text">
                  <div className="switch-row__name">{label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="stack export-actions">
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!hasModel || busy}
              onClick={() => void exportZip()}
            >
              Descargar paquete ZIP
            </button>
            <p className="dim export-note">
              <Badge>nota</Badge> Three.js no se incluye en el ZIP: resuélvelo desde el proyecto
              anfitrión.
            </p>
          </div>
        </Section>

        {status && <p className="muted">{status}</p>}
      </div>
    </>
  )
}
