import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Field, NumberInput, Select, Badge, PanelShell, Stat } from '../../components/ui'
import { analyzePerformance, budgetChecklist, describeOps } from '../../performance/analyzePerformance'
import { formatBytes, formatNumber, formatPercent, reductionPercent } from '../../utils/format'
import type { OptimizationOpId, OptimizationSettings } from '../../types'
import { settingsToSteps } from '../../optimization/runOptimization'
import {
  applyOptimizationResult,
  HIDDEN_FROM_PERF,
  showToast,
} from '../../optimization/optimizationActions'

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

  async function applySuggested(ops: OptimizationOpId[] | undefined, alertId: string) {
    if (!ops?.length) {
      setActivePanel('optimization')
      return
    }
    const runnable = ops.filter((id) => !HIDDEN_FROM_PERF.has(id))
    if (runnable.length === 0) {
      setActivePanel('textures')
      showToast('Estas alertas se resuelven en el panel Texturas')
      return
    }
    const nextSettings = buildSettingsWithOps(runnable)
    setOptimization(nextSettings)
    setActivePanel('optimization')
    setOptimizationFocusOp(runnable[0])
    setApplyingId(alertId)
    try {
      const steps = settingsToSteps({
        ...nextSettings,
        ops: nextSettings.ops.map((o) => ({
          ...o,
          enabled: runnable.includes(o.id),
        })),
      })
      const result = await applyOptimizationResult({
        settings: nextSettings,
        steps,
        base: 'working',
        label: `Aplicar sugeridas: ${runnable.join(', ')}`,
      })
      const orig = originalStats?.fileSizeBytes ?? result.glb.byteLength
      showToast(
        `Aplicado · ${formatBytes(orig)} → ${formatBytes(result.glb.byteLength)} (${formatPercent(reductionPercent(orig, result.glb.byteLength))})`,
      )
      useAppStore.getState().pushConsole({
        level: 'success',
        message: 'Sugerencias aplicadas',
        durationMs: result.durationMs,
      })
    } catch {
      /* error ya manejado */
    } finally {
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
    <PanelShell title="Rendimiento">
        {!stats ? (
          <p className="muted">Importa un modelo para analizar rendimiento.</p>
        ) : (
          <>
            <Section title="Métricas">
              <div className="stat-grid">
                <Stat label="Archivo" value={formatBytes(fileSize ?? 0)} />
                <Stat label="Triángulos" value={formatNumber(stats.triangles.value)} />
                <Stat label="Vértices" value={formatNumber(stats.vertices.value)} />
                <Stat
                  label="Draw calls"
                  value={formatNumber(stats.drawCalls.value)}
                  meta={stats.drawCalls.confidence === 'exact' ? 'medidos' : 'pendiente'}
                />
              </div>
            </Section>

            <Section title="Presupuesto (defaults web)">
              <div className="row mb-2">
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

              <div className="stack mt-2">
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
                      </div>
                    )}
                    {(!a.suggestedOps || a.suggestedOps.length === 0) && a.id === 'texres' && (
                      <div className="alert-item__actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setActivePanel('textures')}
                        >
                          Ir a Texturas
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </Section>
          </>
        )}
    </PanelShell>
  )
}
