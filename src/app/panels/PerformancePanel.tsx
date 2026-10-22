import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Field, NumberInput, Select, Badge } from '../../components/ui'
import { analyzePerformance, budgetChecklist, describeOps } from '../../performance/analyzePerformance'
import { formatBytes, formatNumber, formatPercent, reductionPercent } from '../../utils/format'
import type { OptimizationOpId, OptimizationSettings } from '../../types'
import { runOptimization, settingsToSteps } from '../../optimization/runOptimization'
import { extractTextureInventory } from '../../textures/extractTextures'
import { getModelSession } from '../../store/modelSession'

/** Texturas se gestionan en su panel; no se auto-aplican desde Rendimiento. */
const HIDDEN_FROM_PERF = new Set<OptimizationOpId>(['textureResize', 'textureCompress'])

export function PerformancePanel() {
  const stats = useAppStore((s) => s.stats)
  const budget = useAppStore((s) => s.budget)
  const setBudget = useAppStore((s) => s.setBudget)
  const optimizedSize = useAppStore((s) => s.optimizedSizeBytes)
  const setAlerts = useAppStore((s) => s.setAlerts)
  const alerts = useAppStore((s) => s.alerts)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const setOptimizationFocusOp = useAppStore((s) => s.setOptimizationFocusOp)
  const optimization = useAppStore((s) => s.optimization)
  const setOptimization = useAppStore((s) => s.setOptimization)
  const isOptimizing = useAppStore((s) => s.isOptimizing)
  const setIsOptimizing = useAppStore((s) => s.setIsOptimizing)
  const pushConsole = useAppStore((s) => s.pushConsole)
  const reloadViewerFromWorking = useAppStore((s) => s.reloadViewerFromWorking)
  const pushHistory = useAppStore((s) => s.pushHistory)
  const setTextures = useAppStore((s) => s.setTextures)
  const setToast = useAppStore((s) => s.setToast)
  const appliedOps = useAppStore((s) => s.appliedOps)
  const originalStats = useAppStore((s) => s.originalStats)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const fileSize = optimizedSize ?? stats?.fileSizeBytes ?? null

  useEffect(() => {
    setAlerts(analyzePerformance(stats, budget, fileSize))
  }, [stats, budget, fileSize, setAlerts])

  const checklist = useMemo(
    () => budgetChecklist(stats, budget, fileSize),
    [stats, budget, fileSize],
  )

  function buildSettingsWithOps(ops: OptimizationOpId[]): OptimizationSettings {
    const wantMeshopt = ops.includes('meshopt')
    const wantDraco = ops.includes('draco') && !wantMeshopt
    const nextOps = optimization.ops.map((o) => {
      if (HIDDEN_FROM_PERF.has(o.id)) return { ...o, enabled: false }
      if (ops.includes(o.id)) {
        if (o.id === 'draco' && wantMeshopt) return { ...o, enabled: false }
        if (o.id === 'meshopt' && wantDraco) return { ...o, enabled: false }
        return { ...o, enabled: true }
      }
      return o
    })
    return {
      ...optimization,
      ops: nextOps,
      geometryCompression: wantMeshopt ? 'meshopt' : wantDraco ? 'draco' : optimization.geometryCompression,
    }
  }

  function goToOps(ops?: OptimizationOpId[], activate = false) {
    if (!ops?.length) {
      setActivePanel('optimization')
      return
    }
    if (activate) {
      setOptimization(buildSettingsWithOps(ops))
    }
    setActivePanel('optimization')
    setOptimizationFocusOp(ops.find((id) => !HIDDEN_FROM_PERF.has(id)) ?? ops[0])
  }

  async function applySuggested(ops: OptimizationOpId[] | undefined, alertId: string) {
    if (!ops?.length) {
      setActivePanel('optimization')
      return
    }
    const runnable = ops.filter((id) => !HIDDEN_FROM_PERF.has(id))
    if (runnable.length === 0) {
      setActivePanel('textures')
      setToast('Estas alertas se resuelven en el panel Texturas')
      return
    }
    const nextSettings = buildSettingsWithOps(runnable)
    setOptimization(nextSettings)
    setActivePanel('optimization')
    setOptimizationFocusOp(runnable[0])
    setApplyingId(alertId)
    setIsOptimizing(true)
    pushConsole({ level: 'info', message: `▶ Aplicar sugeridas: ${runnable.join(', ')}` })
    try {
      const steps = settingsToSteps({
        ...nextSettings,
        ops: nextSettings.ops.map((o) => ({
          ...o,
          enabled: runnable.includes(o.id),
        })),
      })
      const result = await runOptimization(
        nextSettings,
        steps,
        {
          onLog: (level, message, details) => pushConsole({ level, message, details }),
        },
        'working',
        appliedOps,
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
      pushHistory(`Sugeridas: ${runnable.join('+')}`, result.glb, result.stats)
      const orig = originalStats?.fileSizeBytes ?? result.glb.byteLength
      setToast(
        `Aplicado · ${formatBytes(orig)} → ${formatBytes(result.glb.byteLength)} (${formatPercent(reductionPercent(orig, result.glb.byteLength))})`,
      )
      pushConsole({
        level: 'success',
        message: 'Sugerencias aplicadas',
        durationMs: result.durationMs,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      pushConsole({ level: 'error', message })
      useAppStore.getState().setError(message)
    } finally {
      setIsOptimizing(false)
      setApplyingId(null)
    }
  }

  function applyWebDefaults(device: 'mobile' | 'desktop') {
    if (device === 'mobile') {
      setBudget({
        targetDevice: 'mobile',
        maxFileSizeBytes: 4 * 1024 * 1024,
        maxTriangles: 80_000,
        maxTextureResolution: 2048,
        maxMaterials: 12,
      })
    } else {
      setBudget({
        targetDevice: 'desktop',
        maxFileSizeBytes: 12 * 1024 * 1024,
        maxTriangles: 250_000,
        maxTextureResolution: 4096,
        maxMaterials: 24,
      })
    }
  }

  return (
    <>
      <div className="tools-panel__header">
        <h1>Rendimiento</h1>
      </div>
      <div className="tools-panel__body">
        {!stats ? (
          <p className="muted">Importa un modelo para analizar rendimiento.</p>
        ) : (
          <>
            <Section title="Métricas">
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-item__label">Archivo</div>
                  <div className="stat-item__value">{formatBytes(fileSize ?? 0)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-item__label">Triángulos</div>
                  <div className="stat-item__value">{formatNumber(stats.triangles.value)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-item__label">Vértices</div>
                  <div className="stat-item__value">{formatNumber(stats.vertices.value)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-item__label">Draw calls</div>
                  <div className="stat-item__value">
                    {formatNumber(stats.drawCalls.value)}
                    <div className="stat-item__meta">
                      {stats.drawCalls.confidence === 'exact' ? 'medidos' : 'pendiente'}
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Presupuesto (defaults web)">
              <div className="row" style={{ marginBottom: 8 }}>
                <button type="button" className="btn" onClick={() => applyWebDefaults('mobile')}>
                  Default móvil
                </button>
                <button type="button" className="btn" onClick={() => applyWebDefaults('desktop')}>
                  Default escritorio
                </button>
              </div>
              <Field label="Dispositivo objetivo">
                <Select
                  value={budget.targetDevice}
                  onChange={(e) =>
                    applyWebDefaults(e.target.value as 'desktop' | 'mobile')
                  }
                >
                  <option value="mobile">Móvil (reportaje)</option>
                  <option value="desktop">Escritorio</option>
                </Select>
              </Field>
              <Field label="Tamaño máx. (MB)">
                <NumberInput
                  value={Math.round((budget.maxFileSizeBytes / 1024 / 1024) * 10) / 10}
                  min={0.5}
                  step={0.5}
                  onChange={(e) =>
                    setBudget({
                      maxFileSizeBytes: Math.max(0.5, Number(e.target.value) || 0.5) * 1024 * 1024,
                    })
                  }
                />
              </Field>
              <Field label="Triángulos máx.">
                <NumberInput
                  value={budget.maxTriangles}
                  min={1000}
                  step={1000}
                  onChange={(e) =>
                    setBudget({ maxTriangles: Math.max(1000, Number(e.target.value) || 1000) })
                  }
                />
              </Field>
              <Field label="Resolución máx. textura">
                <NumberInput
                  value={budget.maxTextureResolution}
                  min={256}
                  step={256}
                  onChange={(e) =>
                    setBudget({
                      maxTextureResolution: Math.max(256, Number(e.target.value) || 256),
                    })
                  }
                />
              </Field>
              <Field label="Materiales máx.">
                <NumberInput
                  value={budget.maxMaterials}
                  min={1}
                  onChange={(e) =>
                    setBudget({ maxMaterials: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </Field>

              <div className="stack" style={{ marginTop: 8 }}>
                {checklist.map((c) => (
                  <div key={c.label} className="row">
                    <Badge tone={c.ok ? 'ok' : 'err'}>{c.ok ? 'OK' : 'NO'}</Badge>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span className="dim">{c.detail}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Alertas">
              {alerts.length === 0 ? (
                <p className="muted">Sin alertas con el presupuesto actual.</p>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className={`alert-item alert-item--${a.severity}`}>
                    <h4>
                      {a.title}{' '}
                      <Badge tone={a.severity === 'info' ? 'info' : a.confirmed ? 'err' : 'lossy'}>
                        {a.severity === 'info'
                          ? 'aviso'
                          : a.confirmed
                            ? 'confirmado'
                            : 'sugerencia'}
                      </Badge>
                    </h4>
                    <p>{a.message}</p>
                    {a.suggestedOps && a.suggestedOps.length > 0 && (
                      <div className="alert-item__actions">
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={isOptimizing}
                          onClick={() => void applySuggested(a.suggestedOps, a.id)}
                        >
                          {applyingId === a.id
                            ? 'Aplicando…'
                            : `Aplicar: ${describeOps(a.suggestedOps.filter((id) => !HIDDEN_FROM_PERF.has(id))) || 'sugeridas'}`}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={isOptimizing}
                          onClick={() => goToOps(a.suggestedOps, true)}
                        >
                          Solo activar y ir
                        </button>
                      </div>
                    )}
                    {(!a.suggestedOps || a.suggestedOps.length === 0) && (
                      <div className="alert-item__actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            setActivePanel(a.id === 'texres' ? 'textures' : 'optimization')
                          }
                        >
                          {a.id === 'texres' ? 'Ir a Texturas' : 'Ir a Optimización'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </Section>
          </>
        )}
      </div>
    </>
  )
}
