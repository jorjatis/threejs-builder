import type { OptimizationOpId, OptimizationSettings, PipelineStep } from '../types'
import { useAppStore } from '../store/useAppStore'
import {
  runOptimization,
  settingsToSteps,
  type OptimizationBase,
  type OptimizationResult,
} from './runOptimization'

/** Ops de textura: se gestionan en el panel Texturas, no en Optimización/Rendimiento. */
export const TEXTURE_OPS = new Set<OptimizationOpId>(['textureResize', 'textureCompress'])

/** Ops ocultas en modo sencillo de Optimización (texturas + palette avanzado). */
export const HIDDEN_SIMPLE_OPS = new Set<OptimizationOpId>([
  'textureResize',
  'textureCompress',
  'palette',
])

/** Ops que Rendimiento no auto-aplica (van a Texturas). */
export const HIDDEN_FROM_PERF = TEXTURE_OPS

let abortController: AbortController | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

export function cancelRunningOptimization(): void {
  abortController?.abort()
}

export function getOptimizationAbortSignal(): AbortSignal | undefined {
  return abortController?.signal
}

/** Toast con auto-dismiss. Pasa `ms: 0` para no cerrar solo. */
export function showToast(message: string, ms = 3200): void {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  useAppStore.getState().setToast(message)
  if (ms > 0) {
    toastTimer = setTimeout(() => {
      toastTimer = null
      if (useAppStore.getState().toastMessage === message) {
        useAppStore.getState().setToast(null)
      }
    }, ms)
  }
}

export interface ApplyOptimizationOptions {
  settings: OptimizationSettings
  /** Si es null, se calculan con settingsToSteps (y filtro pending si base=working). */
  steps?: PipelineStep[] | null
  base?: OptimizationBase
  /** Prefijo de log en consola. */
  label?: string
  /** Tras reload del visor (p. ej. reencuadre editorial). */
  afterReload?: () => void | Promise<void>
  /** Si false, no escribe en la consola de optimización. Default true. */
  log?: boolean
}

/**
 * Ejecuta el pipeline, actualiza el store y recarga el visor.
 * `reloadViewerFromWorking` ya hace merge de texturas eliminadas; no pisar con extract crudo.
 */
export async function applyOptimizationResult(
  opts: ApplyOptimizationOptions,
): Promise<OptimizationResult> {
  const store = useAppStore.getState()
  if (!store.hasModel) {
    throw new Error('No hay modelo cargado.')
  }

  abortController?.abort()
  const ac = new AbortController()
  abortController = ac

  const base = opts.base ?? 'working'
  const log = opts.log !== false
  const push = store.pushConsole

  store.setIsOptimizing(true)
  if (log && opts.label) {
    push({ level: 'info', message: `▶ ${opts.label}` })
  }

  try {
    let steps = opts.steps
    if (steps == null) {
      const all = settingsToSteps(opts.settings)
      if (base === 'working') {
        const applied = store.appliedOps
        const pending = all.filter((s) => !applied.includes(s.op))
        steps = pending.length > 0 ? pending : all
        if (log && pending.length === 0 && all.length > 0) {
          push({
            level: 'warn',
            message: 'Todas las ops ya estaban aplicadas; se reaplican sobre el modelo actual.',
          })
        }
      } else {
        steps = all
      }
    }

    const result = await runOptimization(
      opts.settings,
      steps,
      {
        signal: ac.signal,
        onLog: log
          ? (level, message, details) => push({ level, message, details })
          : undefined,
      },
      base,
      base === 'working' ? store.appliedOps : undefined,
    )

    useAppStore.setState({
      stats: result.stats,
      optimizedSizeBytes: result.glb.byteLength,
      appliedOps: result.appliedOps,
      saveState: { ...useAppStore.getState().saveState, dirty: true },
    })

    // Merge de texturas removed incluido aquí; no llamar setTextures con inventario crudo después.
    await useAppStore.getState().reloadViewerFromWorking()
    await opts.afterReload?.()

    return result
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (log) {
        push({
          level: 'warn',
          message: 'Optimización cancelada. Se conserva la última versión válida.',
        })
      }
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    if (log) push({ level: 'error', message })
    useAppStore.getState().setError(message)
    throw err
  } finally {
    if (abortController === ac) abortController = null
    useAppStore.getState().setIsOptimizing(false)
  }
}
