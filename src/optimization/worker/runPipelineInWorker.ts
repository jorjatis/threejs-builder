import type { OptimizationOpId, OptimizationSettings, PipelineStep } from '../../types'
import type { OpContext } from '../operations'
import type { WorkerPipelineRequest, WorkerPipelineResponse } from './optimization.worker'

/** Ops que requieren main thread (canvas / Draco con scripts DOM). */
const MAIN_THREAD_OPS = new Set<OptimizationOpId>([
  'textureResize',
  'textureCompress',
  'draco',
])

export function canRunPipelineInWorker(steps: PipelineStep[]): boolean {
  return steps.length > 0 && !steps.some((s) => MAIN_THREAD_OPS.has(s.op))
}

let worker: Worker | null = null
let seq = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./optimization.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return worker
}

/**
 * Ejecuta el pipeline en un Web Worker (transferible ArrayBuffer).
 * Emite logs vía ctx.onLog. Respeta AbortSignal abortando el worker y recreándolo.
 */
export function runPipelineInWorker(
  glb: ArrayBuffer,
  steps: PipelineStep[],
  settings: OptimizationSettings,
  ctx: OpContext,
): Promise<ArrayBuffer> {
  const id = `opt-${++seq}`
  const w = getWorker()

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      // Abortar = terminar el worker (no hay AbortSignal nativo fiable hacia el worker)
      w.terminate()
      worker = null
      reject(new DOMException('Operación cancelada', 'AbortError'))
    }

    const onMessage = (ev: MessageEvent<WorkerPipelineResponse>) => {
      const data = ev.data
      if (!data || data.id !== id) return

      if (data.type === 'log') {
        ctx.onLog?.(data.level as 'info', data.message, data.details)
        return
      }
      if (data.type === 'ok') {
        cleanup()
        resolve(data.glb)
        return
      }
      if (data.type === 'error') {
        cleanup()
        reject(new Error(data.message))
      }
    }

    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      ctx.signal?.removeEventListener('abort', onAbort)
    }

    if (ctx.signal?.aborted) {
      reject(new DOMException('Operación cancelada', 'AbortError'))
      return
    }

    ctx.signal?.addEventListener('abort', onAbort, { once: true })
    w.addEventListener('message', onMessage)

    const copy = glb.slice(0)
    const req: WorkerPipelineRequest = {
      type: 'run',
      id,
      glb: copy,
      steps,
      settings: {
        maxTextureSize: settings.maxTextureSize,
        simplifyRatio: settings.simplifyRatio,
        simplifyError: settings.simplifyError,
        textureFormat: settings.textureFormat,
      },
    }
    w.postMessage(req, [copy])
  })
}
