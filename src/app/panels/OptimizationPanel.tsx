import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Editor from '@monaco-editor/react'
import { Expand, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import {
  Section,
  Switch,
  InfoTip,
  Badge,
  Field,
  NumberInput,
  Select,
  Collapse,
} from '../../components/ui'
import {
  OPERATIONS,
  pipelineOrderWarnings,
  sortPipelineSteps,
} from '../../optimization/operations'
import { runOptimization, settingsToSteps } from '../../optimization/runOptimization'
import type { OptimizationBase } from '../../optimization/runOptimization'
import { detectManualTextureEdits, getOpRelevance } from '../../optimization/opRelevance'
import {
  estimateLabel,
  estimateOptimizationImpact,
} from '../../optimization/estimateOptimization'
import {
  OPTIMIZATION_PRESETS,
  applyPresetToSettings,
  formatPipelineJson,
  presetStepsForSimple,
  type OptimizationPreset,
} from '../../optimization/presets'
import { formatBytes, formatDuration, formatPercent, reductionPercent } from '../../utils/format'
import type { OptimizationOpId, PipelineDefinition, PipelineStep } from '../../types'
import { extractTextureInventory } from '../../textures/extractTextures'
import { getModelSession } from '../../store/modelSession'

const CATEGORY_LABEL: Record<string, string> = {
  geometry: 'Geometría',
  materials: 'Materiales y recursos',
  textures: 'Texturas',
  compression: 'Compresión',
}

/** Texturas → panel Texturas. Palette → solo avanzado (riesgo visual). */
const HIDDEN_SIMPLE_OPS = new Set(['textureResize', 'textureCompress', 'palette'])

const LOG_LEVEL_LABEL: Record<string, string> = {
  info: 'Info',
  success: 'Hecho',
  warn: 'Aviso',
  error: 'Error',
  debug: 'Debug',
}

function defaultStepFor(op: OptimizationOpId): PipelineStep {
  switch (op) {
    case 'simplify':
      return { op, params: { ratio: 0.75, error: 0.001 } }
    case 'instance':
    case 'palette':
      return { op, params: { min: 5 } }
    case 'sparse':
      return { op, params: { ratio: 0.2 } }
    case 'textureResize':
      return { op, params: { maxSize: 1024 } }
    case 'textureCompress':
      return { op, params: { format: 'webp' } }
    case 'meshopt':
      return { op, params: { level: 'medium' } }
    case 'draco':
      return { op, params: { method: 'edgebreaker' } }
    default:
      return { op }
  }
}

function opParamsHelp(opId: string): string | null {
  switch (opId) {
    case 'simplify':
      return 'params: ratio (0–1), error · lockBorder siempre activo'
    case 'instance':
      return 'params: min (usos mínimos de la malla, p. ej. 5)'
    case 'palette':
      return 'params: min (materiales compatibles) · puede cambiar el look'
    case 'sparse':
      return 'params: ratio (umbral de valores no cero, p. ej. 0.2)'
    case 'textureResize':
      return 'params: maxSize (px del lado mayor)'
    case 'textureCompress':
      return 'params: format = webp | jpeg | png'
    case 'meshopt':
      return 'params: level = medium | high · al publicar: MeshoptDecoder'
    case 'draco':
      return 'params: method = edgebreaker | sequential · no combinar con meshopt'
    default:
      return null
  }
}

export function OptimizationPanel() {
  const mode = useAppStore((s) => s.optimizationMode)
  const setMode = useAppStore((s) => s.setOptimizationMode)
  const optimization = useAppStore((s) => s.optimization)
  const setOptimization = useAppStore((s) => s.setOptimization)
  const toggleOp = useAppStore((s) => s.toggleOp)
  const pipelineSource = useAppStore((s) => s.pipelineSource)
  const setPipelineSource = useAppStore((s) => s.setPipelineSource)
  const consoleEntries = useAppStore((s) => s.consoleEntries)
  const pushConsole = useAppStore((s) => s.pushConsole)
  const clearConsole = useAppStore((s) => s.clearConsole)
  const isOptimizing = useAppStore((s) => s.isOptimizing)
  const setIsOptimizing = useAppStore((s) => s.setIsOptimizing)
  const requestCancel = useAppStore((s) => s.requestCancelOptimization)
  const resetCancel = useAppStore((s) => s.resetCancelFlag)
  const hasModel = useAppStore((s) => s.hasModel)
  const originalStats = useAppStore((s) => s.originalStats)
  const stats = useAppStore((s) => s.stats)
  const optimizedSize = useAppStore((s) => s.optimizedSizeBytes)
  const reloadViewerFromWorking = useAppStore((s) => s.reloadViewerFromWorking)
  const pushHistory = useAppStore((s) => s.pushHistory)
  const restoreOriginal = useAppStore((s) => s.restoreOriginal)
  const setTextures = useAppStore((s) => s.setTextures)
  const textures = useAppStore((s) => s.textures)
  const askConfirm = useAppStore((s) => s.askConfirm)
  const abortRef = useRef<AbortController | null>(null)
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'success'>('all')
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [consoleModalOpen, setConsoleModalOpen] = useState(false)

  useEffect(() => {
    if (!pipelineModalOpen && !consoleModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setPipelineModalOpen(false)
      setConsoleModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pipelineModalOpen, consoleModalOpen])

  const originalSize = originalStats?.fileSizeBytes ?? 0
  const currentSize = optimizedSize ?? stats?.fileSizeBytes ?? 0
  const reduction = reductionPercent(originalSize, currentSize)

  const grouped = useMemo(() => {
    const map = new Map<string, typeof OPERATIONS>()
    for (const op of OPERATIONS) {
      if (HIDDEN_SIMPLE_OPS.has(op.id)) continue
      const list = map.get(op.category) ?? []
      list.push(op)
      map.set(op.category, list)
    }
    return [...map.entries()]
  }, [])

  /** Pipeline del modo sencillo: sin ops de textura (van al panel Texturas). */
  function simpleSettings(base = optimization) {
    return {
      ...base,
      ops: base.ops.map((o) =>
        HIDDEN_SIMPLE_OPS.has(o.id) ? { ...o, enabled: false } : o,
      ),
    }
  }

  const appliedOps = useAppStore((s) => s.appliedOps)
  const focusOp = useAppStore((s) => s.optimizationFocusOp)
  const setOptimizationFocusOp = useAppStore((s) => s.setOptimizationFocusOp)

  const opCtx = useMemo(() => {
    const session = getModelSession()
    return {
      original: originalStats,
      current: stats,
      textures,
      settings: optimization,
      appliedOps,
      removedCount: session?.removedTextures.size ?? 0,
    }
  }, [originalStats, stats, textures, optimization, appliedOps])

  const manualTex = useMemo(() => detectManualTextureEdits(opCtx), [opCtx])

  const relevanceById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getOpRelevance>>()
    for (const op of OPERATIONS) {
      map.set(op.id, getOpRelevance(op.id, opCtx))
    }
    return map
  }, [opCtx])

  const simplePendingSteps = useMemo(() => {
    const all = settingsToSteps(simpleSettings())
    const pending = all.filter((s) => !appliedOps.includes(s.op))
    return pending.length > 0 ? pending : all
  }, [optimization, appliedOps])

  const simpleEstimate = useMemo(
    () => estimateOptimizationImpact(stats, textures, simplePendingSteps),
    [stats, textures, simplePendingSteps],
  )

  const advancedSteps = useMemo(() => {
    try {
      const parsed = JSON.parse(pipelineSource) as PipelineDefinition
      return Array.isArray(parsed.steps) ? parsed.steps : []
    } catch {
      return [] as PipelineStep[]
    }
  }, [pipelineSource])

  const advancedEstimate = useMemo(
    () => estimateOptimizationImpact(stats, textures, advancedSteps),
    [stats, textures, advancedSteps],
  )

  const orderWarnings = useMemo(() => pipelineOrderWarnings(advancedSteps), [advancedSteps])

  useEffect(() => {
    if (!focusOp) return
    const el = document.getElementById(`op-${focusOp}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.classList.add('op-highlight')
    const t = window.setTimeout(() => {
      el?.classList.remove('op-highlight')
      setOptimizationFocusOp(null)
    }, 2200)
    return () => window.clearTimeout(t)
  }, [focusOp, setOptimizationFocusOp])

  async function runSteps(
    steps: PipelineStep[] | null,
    label: string,
    base: OptimizationBase = 'working',
    settingsOverride?: typeof optimization,
  ) {
    if (!hasModel) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    resetCancel()
    setIsOptimizing(true)
    pushConsole({ level: 'info', message: `▶ ${label}` })

    try {
      const settings = settingsOverride ?? optimization
      let resolved = steps
      if (resolved == null) {
        const all = settingsToSteps(settings)
        if (base === 'working') {
          const pending = all.filter((s) => !appliedOps.includes(s.op))
          resolved = pending.length > 0 ? pending : all
          if (pending.length === 0 && all.length > 0) {
            pushConsole({
              level: 'warn',
              message: 'Todas las ops ya estaban aplicadas; se reaplican sobre el modelo actual.',
            })
          }
        } else {
          resolved = all
        }
      }
      const result = await runOptimization(
        settings,
        resolved,
        {
          signal: ac.signal,
          onLog: (level, message, details) => pushConsole({ level, message, details }),
        },
        base,
        base === 'working' ? appliedOps : undefined,
      )

      useAppStore.setState({
        stats: result.stats,
        optimizedSizeBytes: result.glb.byteLength,
        appliedOps: result.appliedOps,
        saveState: { ...useAppStore.getState().saveState, dirty: true },
      })

      await reloadViewerFromWorking()
      const session = getModelSession()
      if (session?.document) {
        setTextures(await extractTextureInventory(session.document))
      }

      pushHistory(label, result.glb, result.stats)
      pushConsole({
        level: 'success',
        message: `Pipeline finalizado`,
        durationMs: result.durationMs,
        details: `${formatBytes(originalSize)} → ${formatBytes(result.glb.byteLength)} (${formatPercent(reductionPercent(originalSize, result.glb.byteLength))})`,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        pushConsole({ level: 'warn', message: 'Optimización cancelada. Se conserva la última versión válida.' })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        pushConsole({ level: 'error', message })
        useAppStore.getState().setError(message)
      }
    } finally {
      setIsOptimizing(false)
    }
  }

  async function onToggle(id: (typeof OPERATIONS)[number]['id'], enabled: boolean) {
    if (HIDDEN_SIMPLE_OPS.has(id)) return
    const opName = OPERATIONS.find((o) => o.id === id)?.name ?? id

    if (!enabled) {
      const ok = await askConfirm({
        title: `Desactivar «${opName}»`,
        message: manualTex.changed
          ? `Al desactivar se reconstruye el modelo desde el archivo original y se vuelven a aplicar solo las ops que sigan activas.\n\nPerderás cambios hechos fuera de este panel (p. ej. texturas: ${manualTex.summary}).\n\n¿Continuar?`
          : `Al desactivar se reconstruye desde el original y se reaplican las ops que sigan activas. No hay «deshacer» por operación.\n\n¿Continuar?`,
        confirmLabel: 'Reconstruir',
        danger: true,
      })
      if (!ok) return
    } else if (id === 'simplify') {
      const rel = relevanceById.get(id)
      if (rel?.usefulness === 'skip') {
        const ok = await askConfirm({
          title: `Activar «${opName}»`,
          message: `${rel.hint}\n\n¿Activarla igual?`,
          confirmLabel: 'Activar',
        })
        if (!ok) return
      }
    }

    if (enabled && (id === 'meshopt' || id === 'draco')) {
      const other = id === 'meshopt' ? 'draco' : 'meshopt'
      toggleOp(other, false)
      setOptimization({ geometryCompression: id })
    }
    if (!enabled && (id === 'meshopt' || id === 'draco')) {
      setOptimization({ geometryCompression: 'none' })
    }
    toggleOp(id, enabled)

    const nextOps = optimization.ops.map((o) => {
      if (HIDDEN_SIMPLE_OPS.has(o.id)) return { ...o, enabled: false }
      if (o.id === id) return { ...o, enabled }
      if (enabled && ((id === 'meshopt' && o.id === 'draco') || (id === 'draco' && o.id === 'meshopt'))) {
        return { ...o, enabled: false }
      }
      return o
    })
    const nextSettings = simpleSettings({
      ...optimization,
      ops: nextOps,
      geometryCompression:
        enabled && id === 'meshopt'
          ? ('meshopt' as const)
          : enabled && id === 'draco'
            ? ('draco' as const)
            : !enabled && (id === 'meshopt' || id === 'draco')
              ? ('none' as const)
              : optimization.geometryCompression,
    })

    if (enabled) {
      const step = settingsToSteps({
        ...nextSettings,
        ops: nextSettings.ops.map((o) => ({ ...o, enabled: o.id === id })),
      })
      await runSteps(step, `Activar ${id}`, 'working', nextSettings)
    } else {
      pushConsole({
        level: 'warn',
        message:
          'Reconstrucción desde el original con las ops activas. Cambios manuales de texturas/modelo no incluidos en el pipeline se pierden.',
      })
      await runSteps(settingsToSteps(nextSettings), `Desactivar ${id}`, 'original', nextSettings)
    }
  }

  async function reapplySimplifyParams() {
    const next = simpleSettings({
      ...optimization,
      ops: optimization.ops.map((o) =>
        HIDDEN_SIMPLE_OPS.has(o.id) ? { ...o, enabled: false } : o,
      ),
    })
    const ok = await askConfirm({
      title: 'Reaplicar simplificación',
      message:
        'Para usar el nuevo ratio/error hay que reconstruir desde el original con las ops activas (la simplificación no se puede apilar).\n\n¿Continuar?',
      confirmLabel: 'Reaplicar',
    })
    if (!ok) return
    await runSteps(settingsToSteps(next), 'Reaplicar simplify', 'original', next)
  }

  function runAdvanced() {
    try {
      const parsed = JSON.parse(pipelineSource) as PipelineDefinition
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        throw new Error('El pipeline debe ser un JSON con { name, steps: [{ op, params? }] }')
      }
      void runSteps(parsed.steps, parsed.name || 'Pipeline avanzado', 'working')
    } catch (err) {
      pushConsole({
        level: 'error',
        message: err instanceof Error ? err.message : 'JSON de pipeline inválido',
      })
    }
  }

  function sortAdvancedPipeline() {
    try {
      const parsed = JSON.parse(pipelineSource) as PipelineDefinition
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        throw new Error('JSON sin array «steps»')
      }
      parsed.steps = sortPipelineSteps(parsed.steps)
      writePipeline(parsed)
      pushConsole({
        level: 'info',
        message: 'Pasos reordenados al orden recomendado (y sin duplicados).',
      })
    } catch (err) {
      pushConsole({
        level: 'error',
        message: err instanceof Error ? err.message : 'No se pudo ordenar el pipeline',
      })
    }
  }

  function parsePipeline(): PipelineDefinition | null {
    try {
      const parsed = JSON.parse(pipelineSource) as PipelineDefinition
      if (!parsed.steps || !Array.isArray(parsed.steps)) return null
      return parsed
    } catch {
      return null
    }
  }

  const pipelineStepIds = useMemo(() => {
    try {
      const parsed = JSON.parse(pipelineSource) as PipelineDefinition
      if (!Array.isArray(parsed.steps)) return new Set<string>()
      return new Set(parsed.steps.map((s) => s.op))
    } catch {
      return new Set<string>()
    }
  }, [pipelineSource])

  /** JSON legible: cada paso en una sola línea (como el pipeline por defecto). */
  function formatPipelineStep(step: PipelineStep): string {
    if (step.params && Object.keys(step.params).length > 0) {
      const params = Object.entries(step.params)
        .map(([k, v]) => `"${k}": ${JSON.stringify(v)}`)
        .join(', ')
      return `{ "op": "${step.op}", "params": { ${params} } }`
    }
    return `{ "op": "${step.op}" }`
  }

  function formatPipelineSource(parsed: PipelineDefinition): string {
    const name = JSON.stringify(parsed.name ?? 'Pipeline')
    const steps = parsed.steps ?? []
    if (steps.length === 0) {
      return `{\n  "name": ${name},\n  "steps": []\n}\n`
    }
    const lines = steps.map((s, i) => {
      const comma = i < steps.length - 1 ? ',' : ''
      return `    ${formatPipelineStep(s)}${comma}`
    })
    return `{\n  "name": ${name},\n  "steps": [\n${lines.join('\n')}\n  ]\n}\n`
  }

  function writePipeline(parsed: PipelineDefinition) {
    setPipelineSource(formatPipelineSource(parsed))
  }

  function insertPipelineStep(opId: OptimizationOpId) {
    try {
      const parsed = parsePipeline()
      if (!parsed) throw new Error('JSON sin array «steps» válido')
      if (parsed.steps.some((s) => s.op === opId)) {
        pushConsole({
          level: 'warn',
          message: `«${opId}» ya está en el pipeline. Añadirla otra vez solo la repetiría sin beneficio.`,
        })
        return
      }
      // Meshopt y Draco son incompatibles en el mismo archivo
      let swapped: OptimizationOpId | null = null
      if (opId === 'meshopt' || opId === 'draco') {
        const other: OptimizationOpId = opId === 'meshopt' ? 'draco' : 'meshopt'
        if (parsed.steps.some((s) => s.op === other)) {
          parsed.steps = parsed.steps.filter((s) => s.op !== other)
          swapped = other
        }
      }
      parsed.steps = sortPipelineSteps([...parsed.steps, defaultStepFor(opId)])
      writePipeline(parsed)
      pushConsole({
        level: 'info',
        message: swapped
          ? `Añadido «${opId}» (orden recomendado) y quitado «${swapped}».`
          : `Añadido «${opId}» en el orden recomendado. Revisa params y pulsa Aplicar pipeline.`,
      })
    } catch (err) {
      pushConsole({
        level: 'error',
        message:
          err instanceof Error
            ? `No se pudo insertar: ${err.message}. Corrige el JSON primero.`
            : 'No se pudo insertar el paso',
      })
    }
  }

  function removePipelineStepByOp(opId: OptimizationOpId) {
    const parsed = parsePipeline()
    if (!parsed) {
      pushConsole({
        level: 'error',
        message: 'No se pudo quitar: JSON inválido. Corrígelo en el editor.',
      })
      return
    }
    const before = parsed.steps.length
    parsed.steps = sortPipelineSteps(parsed.steps.filter((s) => s.op !== opId))
    if (parsed.steps.length === before) return
    writePipeline(parsed)
    pushConsole({
      level: 'info',
      message: `Eliminado «${opId}» del pipeline.`,
    })
  }

  async function onRestoreOriginal() {
    const ok = await askConfirm({
      title: 'Restaurar original',
      message:
        'Se descartan optimizaciones y cambios del modelo de trabajo. ¿Continuar?',
      confirmLabel: 'Restaurar',
      danger: true,
    })
    if (ok) void restoreOriginal()
  }

  async function applyOptimizationPreset(preset: OptimizationPreset) {
    const nextSettings = applyPresetToSettings(preset, optimization)
    setOptimization(nextSettings)
    setPipelineSource(formatPipelineJson(preset.pipeline))
    setActivePresetId(preset.id)

    const steps =
      mode === 'simple' ? presetStepsForSimple(preset) : sortPipelineSteps(preset.pipeline.steps)
    const texNote =
      mode === 'simple' &&
      preset.pipeline.steps.some((s) => s.op === 'textureResize' || s.op === 'textureCompress')
        ? '\n\nEn modo sencillo las texturas no se tocan aquí: usa el panel Texturas (o Avanzado) si quieres reducirlas también.'
        : ''

    if (!hasModel) {
      pushConsole({
        level: 'info',
        message: `Preset «${preset.name}» cargado. Importa un modelo y pulsa Aplicar.`,
      })
      return
    }

    const ok = await askConfirm({
      title: preset.name,
      message: `${preset.description}${texNote}\n\n¿Aplicar desde el original con este pipeline?`,
      confirmLabel: 'Aplicar preset',
    })
    if (!ok) {
      pushConsole({
        level: 'info',
        message: `Preset «${preset.name}» configurado (sin aplicar).`,
      })
      return
    }

    await runSteps(
      steps,
      preset.pipeline.name,
      'original',
      mode === 'simple' ? simpleSettings(nextSettings) : nextSettings,
    )
  }

  const filteredLogs = consoleEntries.filter(
    (e) => logFilter === 'all' || e.level === logFilter || (logFilter === 'info' && e.level === 'debug'),
  )

  return (
    <>
      <div className="tools-panel__header">
        <h1>Optimización</h1>
      </div>
      <div className="tools-panel__body">
        <div className="tabs">
          <button type="button" className={mode === 'simple' ? 'active' : ''} onClick={() => setMode('simple')}>
            Sencillo
          </button>
          <button type="button" className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}>
            Avanzado
          </button>
        </div>

        {!hasModel && <p className="muted">Importa un modelo para optimizar.</p>}

        {mode === 'simple' && (
          <Section title="Presets">
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
              Atajos según el objetivo. Configuran las ops y pueden aplicarse desde el original.
            </p>
            <div className="preset-list">
              {OPTIMIZATION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-item${activePresetId === p.id ? ' preset-item--active' : ''}`}
                  disabled={isOptimizing}
                  onClick={() => void applyOptimizationPreset(p)}
                >
                  <strong>{p.name}</strong>
                  <span className="dim">{p.description}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {mode === 'simple' && (
          <>
            {hasModel && manualTex.changed && (
              <div className="opt-callout opt-callout--warn" role="status">
                <strong>Texturas editadas en el panel Texturas.</strong>
                <span>{manualTex.summary}.</span>
                <span>
                  Desactivar un switch aquí reconstruye desde el original y puede deshacer esos
                  cambios. Resize/compresión de texturas: usa el panel Texturas.
                </span>
              </div>
            )}

            <p className="muted" style={{ marginTop: 0 }}>
              Resize y compresión de texturas están en el panel <strong>Texturas</strong>. Aquí solo
              geometría, materiales y compresión de mallas.
            </p>

            {grouped.map(([cat, ops]) => (
              <Section key={cat} title={CATEGORY_LABEL[cat] || cat}>
                {ops.map((op) => {
                  const cfg = optimization.ops.find((o) => o.id === op.id)
                  const available = cfg?.available !== false
                  const rel = relevanceById.get(op.id)
                  const on = !!cfg?.enabled
                  return (
                    <div
                      className={`switch-row${rel?.usefulness === 'skip' ? ' switch-row--dim' : ''}`}
                      key={op.id}
                      id={`op-${op.id}`}
                    >
                      <Switch
                        checked={on}
                        disabled={!hasModel || isOptimizing || !available}
                        onChange={(v) => void onToggle(op.id, v)}
                      />
                      <div className="switch-row__text">
                        <div className="switch-row__name">
                          {op.name}
                          <InfoTip text={op.description} />
                          {op.lossy ? <Badge tone="lossy">con pérdida</Badge> : null}
                          {rel?.badge ? (
                            <Badge tone={rel.badgeTone ?? 'info'}>{rel.badge}</Badge>
                          ) : null}
                          {!available ? <Badge tone="err">no disponible</Badge> : null}
                        </div>
                        <div className="switch-row__desc">
                          {cfg?.unavailableReason || rel?.hint || op.description}
                        </div>
                        {op.id === 'simplify' && on && (
                          <div className="switch-row__params">
                            <Field
                              label="Ratio a conservar"
                              tip="Fracción de triángulos a dejar (0–1). Ej. 0.2 ≈ 20%."
                            >
                              <NumberInput
                                min={0.05}
                                max={1}
                                step={0.05}
                                value={optimization.simplifyRatio}
                                onChange={(e) =>
                                  setOptimization({ simplifyRatio: Number(e.target.value) })
                                }
                              />
                            </Field>
                            <Field
                              label="Error máximo"
                              tip="Tolerancia Meshopt. Más alto = más agresivo (más deformación)."
                            >
                              <NumberInput
                                min={0.00001}
                                max={0.1}
                                step={0.0001}
                                value={optimization.simplifyError}
                                onChange={(e) =>
                                  setOptimization({ simplifyError: Number(e.target.value) })
                                }
                              />
                            </Field>
                            <button
                              type="button"
                              className="btn btn--block"
                              disabled={!hasModel || isOptimizing}
                              onClick={() => void reapplySimplifyParams()}
                            >
                              Reaplicar con estos valores
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </Section>
            ))}

            <p className="muted" style={{ marginTop: 4 }}>
              Activar aplica esa operación al instante. Desactivar reconstruye desde el original.
            </p>

            {hasModel && simpleEstimate && simplePendingSteps.length > 0 && (
              <div className="opt-estimate" role="status">
                <strong>Estimación (pendiente)</strong>
                <span>{estimateLabel(simpleEstimate)}</span>
                <span className="muted">
                  {formatBytes(simpleEstimate.currentBytes)} → ≈{' '}
                  {formatBytes(simpleEstimate.estimatedBytes)}
                  {simpleEstimate.currentTris > 0
                    ? ` · ${simpleEstimate.currentTris.toLocaleString('es-ES')} → ≈ ${simpleEstimate.estimatedTris.toLocaleString('es-ES')} tris`
                    : ''}
                </span>
              </div>
            )}

            <div className="stack" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!hasModel || isOptimizing}
                onClick={() =>
                  void runSteps(
                    settingsToSteps(simpleSettings()),
                    'Aplicar pipeline',
                    'working',
                    simpleSettings(),
                  )
                }
              >
                {isOptimizing ? 'Procesando…' : 'Aplicar pipeline'}
              </button>
              {isOptimizing && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    requestCancel()
                    abortRef.current?.abort()
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={!hasModel || isOptimizing}
                onClick={() => void onRestoreOriginal()}
              >
                Restaurar original
              </button>
            </div>
          </>
        )}

        {mode === 'advanced' && (
          <div className="advanced-layout">
            <div className="opt-howto">
              <strong>Cómo funciona el JSON</strong>
              <ol>
                <li>
                  <code>name</code> es solo una etiqueta del pipeline.
                </li>
                <li>
                  <code>steps</code> es la lista de operaciones <em>en orden</em>. Se ejecutan de
                  arriba a abajo sobre el modelo actual.
                </li>
                <li>
                  Cada paso: <code>{'{ "op": "id" }'}</code> o con parámetros{' '}
                  <code>{'{ "op": "simplify", "params": { "ratio": 0.5 } }'}</code>.
                </li>
                <li>
                  Edita a mano, usa la referencia, o abre el editor en grande (botón ampliar) para
                  añadir/quitar ops con ayuda.
                </li>
                <li>
                  Texturas: puedes usar <code>textureResize</code> / <code>textureCompress</code>{' '}
                  aquí; en modo sencillo van al panel Texturas.
                </li>
              </ol>
            </div>

            <Collapse title="Referencia de operaciones (qué hace cada op)">
              <p className="muted" style={{ marginTop: 0 }}>
                «Añadir» inserta el paso una sola vez. Si ya está, puedes quitarlo.
              </p>
              <div className="stack">
                {OPERATIONS.map((op) => {
                  const params = opParamsHelp(op.id)
                  const inPipeline = pipelineStepIds.has(op.id)
                  return (
                    <div key={op.id} className="op-ref">
                      <div className="op-ref__head">
                        <div>
                          <code>&quot;{op.id}&quot;</code>
                          <span className="op-ref__name"> — {op.name}</span>
                          {op.lossy ? <Badge tone="lossy">con pérdida</Badge> : null}
                          {inPipeline ? <Badge tone="ok">en pipeline</Badge> : null}
                        </div>
                        <button
                          type="button"
                          className="btn"
                          disabled={isOptimizing}
                          onClick={() =>
                            inPipeline
                              ? removePipelineStepByOp(op.id)
                              : insertPipelineStep(op.id)
                          }
                        >
                          {inPipeline ? 'Quitar' : 'Añadir'}
                        </button>
                      </div>
                      <div className="op-ref__desc">{op.description}</div>
                      {params ? <div className="op-ref__params">{params}</div> : null}
                    </div>
                  )
                })}
              </div>
            </Collapse>

            <div className="field">
              <label>Editor del pipeline</label>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Cambia <code>ratio</code>, <code>maxSize</code>, quita pasos del array o reordénalos.
                El icono de ampliar abre la vista con operaciones al lado.
              </p>
            </div>
            <div className="advanced-layout__editor">
              <button
                type="button"
                className="btn btn--icon advanced-layout__expand"
                title="Ampliar editor"
                aria-label="Ampliar editor"
                onClick={() => setPipelineModalOpen(true)}
              >
                <Expand size={14} />
              </button>
              <Editor
                height="240px"
                defaultLanguage="json"
                theme="vs-dark"
                value={pipelineSource}
                onChange={(v) => setPipelineSource(v ?? '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  tabSize: 2,
                  automaticLayout: true,
                }}
              />
            </div>
            {orderWarnings.length > 0 && (
              <div className="opt-callout opt-callout--warn" role="status">
                <strong>Orden del pipeline</strong>
                {orderWarnings.map((w) => (
                  <span key={w}>{w}</span>
                ))}
                <button
                  type="button"
                  className="btn"
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  onClick={sortAdvancedPipeline}
                >
                  Ordenar pasos
                </button>
              </div>
            )}

            {hasModel && advancedEstimate && advancedSteps.length > 0 && (
              <div className="opt-estimate" role="status">
                <strong>Estimación</strong>
                <span>{estimateLabel(advancedEstimate)}</span>
                <span className="muted">
                  {formatBytes(advancedEstimate.currentBytes)} → ≈{' '}
                  {formatBytes(advancedEstimate.estimatedBytes)}
                </span>
              </div>
            )}

            <div className="stack advanced-layout__actions">
              {orderWarnings.length === 0 && advancedSteps.length > 1 && (
                <button type="button" className="btn btn--block" onClick={sortAdvancedPipeline}>
                  Ordenar pasos (recomendado)
                </button>
              )}
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={!hasModel || isOptimizing}
                onClick={runAdvanced}
              >
                {isOptimizing ? 'Procesando…' : 'Aplicar pipeline'}
              </button>
              {isOptimizing && (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => {
                    requestCancel()
                    abortRef.current?.abort()
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                className="btn btn--block"
                disabled={!hasModel || isOptimizing}
                onClick={() => void onRestoreOriginal()}
              >
                Restaurar original
              </button>
            </div>
          </div>
        )}

        <div className="opt-console-block">
          <Section title="Consola del pipeline">
            <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>
              Registro de lo que hace cada paso al optimizar: inicio, avisos, errores y resultado
              (tamaños). Filtra por tipo si hay mucho ruido.
            </p>
            <div className="row console-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <Select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                aria-label="Filtrar consola"
              >
                <option value="all">Todos los mensajes</option>
                <option value="info">Solo info</option>
                <option value="success">Solo éxitos</option>
                <option value="warn">Solo avisos</option>
                <option value="error">Solo errores</option>
              </Select>
              <button type="button" className="btn" onClick={clearConsole}>
                Limpiar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    consoleEntries
                      .map(
                        (e) =>
                          `[${LOG_LEVEL_LABEL[e.level] ?? e.level}] ${e.message}${e.details ? ` — ${e.details}` : ''}`,
                      )
                      .join('\n'),
                  )
                }
              >
                Copiar log
              </button>
            </div>
            <div className="console console--with-expand" role="log" aria-live="polite">
              <button
                type="button"
                className="btn btn--icon console__expand"
                title="Ampliar consola"
                aria-label="Ampliar consola"
                onClick={() => setConsoleModalOpen(true)}
              >
                <Expand size={14} />
              </button>
              {filteredLogs.length === 0 && (
                <div className="console__empty">
                  Aún no hay mensajes. Al aplicar un pipeline aquí verás cada operación y el
                  resultado.
                </div>
              )}
              {filteredLogs.map((e) => (
                <div key={e.id} className={`console__line console__line--${e.level}`}>
                  <span className="console__meta">
                    {new Date(e.timestamp).toLocaleTimeString('es-ES')}
                  </span>
                  <span className={`console__level console__level--${e.level}`}>
                    {LOG_LEVEL_LABEL[e.level] ?? e.level}
                  </span>
                  <span className="console__msg">
                    {e.message}
                    {e.durationMs != null ? ` (${formatDuration(e.durationMs)})` : ''}
                    {e.details ? (
                      <>
                        <br />
                        <span className="console__details">{e.details}</span>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Antes / después">
          <div className="stat-grid">
            <div className="stat-item">
              <div className="stat-item__label">Original</div>
              <div className="stat-item__value">{formatBytes(originalSize)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item__label">Actual</div>
              <div className="stat-item__value">{formatBytes(currentSize)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item__label">Diferencia</div>
              <div className="stat-item__value">{formatBytes(Math.abs(originalSize - currentSize))}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item__label">Reducción</div>
              <div className="stat-item__value">{formatPercent(reduction)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item__label">Triángulos</div>
              <div className="stat-item__value">
                {originalStats?.triangles.value ?? '—'} → {stats?.triangles.value ?? '—'}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-item__label">Texturas / materiales</div>
              <div className="stat-item__value">
                {stats?.textures.value ?? '—'} / {stats?.materials.value ?? '—'}
              </div>
            </div>
          </div>
        </Section>
      </div>

      {consoleModalOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setConsoleModalOpen(false)}
          >
            <div
              className="modal modal--console"
              role="dialog"
              aria-modal="true"
              aria-labelledby="console-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__header">
                <h2 id="console-modal-title">Consola del pipeline</h2>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="Cerrar"
                  onClick={() => setConsoleModalOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="modal__body console-modal__body">
                <div className="row console-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                  <Select
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                    aria-label="Filtrar consola"
                  >
                    <option value="all">Todos los mensajes</option>
                    <option value="info">Solo info</option>
                    <option value="success">Solo éxitos</option>
                    <option value="warn">Solo avisos</option>
                    <option value="error">Solo errores</option>
                  </Select>
                  <button type="button" className="btn" onClick={clearConsole}>
                    Limpiar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        consoleEntries
                          .map(
                            (e) =>
                              `[${LOG_LEVEL_LABEL[e.level] ?? e.level}] ${e.message}${e.details ? ` — ${e.details}` : ''}`,
                          )
                          .join('\n'),
                      )
                    }
                  >
                    Copiar log
                  </button>
                </div>
                <div className="console console--modal" role="log" aria-live="polite">
                  {filteredLogs.length === 0 && (
                    <div className="console__empty">Sin mensajes en este filtro.</div>
                  )}
                  {filteredLogs.map((e) => (
                    <div key={e.id} className={`console__line console__line--${e.level}`}>
                      <span className="console__meta">
                        {new Date(e.timestamp).toLocaleTimeString('es-ES')}
                      </span>
                      <span className={`console__level console__level--${e.level}`}>
                        {LOG_LEVEL_LABEL[e.level] ?? e.level}
                      </span>
                      <span className="console__msg">
                        {e.message}
                        {e.durationMs != null ? ` (${formatDuration(e.durationMs)})` : ''}
                        {e.details ? (
                          <>
                            <br />
                            <span className="console__details">{e.details}</span>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal__footer modal__footer--actions">
                <button type="button" className="btn" onClick={() => setConsoleModalOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {pipelineModalOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setPipelineModalOpen(false)}
          >
            <div
              className="modal modal--pipeline"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pipeline-editor-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__header">
                <h2 id="pipeline-editor-title">Editor de pipeline</h2>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="Cerrar"
                  onClick={() => setPipelineModalOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="modal__body pipeline-modal__body">
                <aside className="pipeline-modal__ops">
                  <div className="pipeline-modal__aside-title">Operaciones</div>
                  <p className="muted pipeline-modal__hint">
                    Cada op solo una vez. Al añadir/quitar el JSON se reordena solo (orden
                    recomendado). La i explica qué hace.
                  </p>
                  <div className="pipeline-modal__ops-list">
                    {OPERATIONS.map((op) => {
                      const tip = [op.description, opParamsHelp(op.id)].filter(Boolean).join(' ')
                      const inPipeline = pipelineStepIds.has(op.id)
                      return (
                        <div
                          key={op.id}
                          className={`pipeline-modal__op${inPipeline ? ' pipeline-modal__op--on' : ''}`}
                        >
                          <div className="pipeline-modal__op-main">
                            <code>&quot;{op.id}&quot;</code>
                            <span>{op.name}</span>
                            <InfoTip text={tip} />
                            {op.lossy ? <Badge tone="lossy">pérdida</Badge> : null}
                          </div>
                          <button
                            type="button"
                            className="btn"
                            disabled={isOptimizing}
                            onClick={() =>
                              inPipeline
                                ? removePipelineStepByOp(op.id)
                                : insertPipelineStep(op.id)
                            }
                          >
                            {inPipeline ? 'Quitar' : 'Añadir'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </aside>
                <div className="pipeline-modal__main">
                  <div className="pipeline-modal__editor">
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      theme="vs-dark"
                      value={pipelineSource}
                      onChange={(v) => setPipelineSource(v ?? '')}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                        automaticLayout: true,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="modal__footer modal__footer--actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPipelineModalOpen(false)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!hasModel || isOptimizing}
                  onClick={() => {
                    runAdvanced()
                    setPipelineModalOpen(false)
                  }}
                >
                  {isOptimizing ? 'Procesando…' : 'Aplicar pipeline'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
