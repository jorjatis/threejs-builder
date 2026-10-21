import type { PipelineStep, OptimizationSettings, OptimizationOpId, ModelStats } from '../types'
import { cloneDocumentFromGlb, writeDocumentToGlb } from '../model/gltfIo'
import { inspectDocument } from '../model/inspectModel'
import { CANONICAL_OP_ORDER, runPipelineOnDocument, type OpContext } from './operations'
import { getModelSession, updateWorkingGlb } from '../store/modelSession'

export interface OptimizationResult {
  glb: ArrayBuffer
  stats: ModelStats
  appliedOps: OptimizationOpId[]
  durationMs: number
}

export type OptimizationBase = 'working' | 'original'

/** Construye pasos a partir de los switches del modo sencillo. */
export function settingsToSteps(settings: OptimizationSettings): PipelineStep[] {
  const steps: PipelineStep[] = []
  const enabled = new Set(settings.ops.filter((o) => o.enabled).map((o) => o.id))

  for (const id of CANONICAL_OP_ORDER) {
    if (!enabled.has(id)) continue

    const params: Record<string, number | string | boolean> = {}
    const opCfg = settings.ops.find((o) => o.id === id)
    if (id === 'simplify') {
      params.ratio = settings.simplifyRatio
      params.error = settings.simplifyError
    }
    if (id === 'instance' || id === 'palette') {
      params.min = typeof opCfg?.params.min === 'number' ? opCfg.params.min : 5
    }
    if (id === 'sparse') {
      params.ratio = typeof opCfg?.params.ratio === 'number' ? opCfg.params.ratio : 0.2
    }
    if (id === 'textureResize') params.maxSize = settings.maxTextureSize
    if (id === 'textureCompress') {
      params.format =
        settings.textureFormat === 'keep' ? 'webp' : settings.textureFormat
    }
    if (id === 'meshopt') {
      params.level = opCfg?.params.level === 'high' ? 'high' : 'medium'
    }
    if (id === 'draco') {
      params.method =
        opCfg?.params.method === 'sequential' ? 'sequential' : 'edgebreaker'
    }
    steps.push({ op: id, params })
  }

  return steps
}

/**
 * Ejecuta el pipeline.
 * - base 'working': parte del modelo actual (no resetea ediciones previas).
 * - base 'original': reconstruye desde el original (p. ej. al desactivar una op).
 */
export async function runOptimization(
  settings: OptimizationSettings,
  stepsOverride: PipelineStep[] | null,
  ctx: OpContext,
  base: OptimizationBase = 'working',
  appliedOpsMerge?: OptimizationOpId[],
): Promise<OptimizationResult> {
  const session = getModelSession()
  if (!session) throw new Error('No hay modelo cargado.')

  const t0 = performance.now()
  const steps = stepsOverride ?? settingsToSteps(settings)
  const sourceGlb = base === 'original' ? session.originalGlb : session.workingGlb

  if (steps.length === 0 && base === 'original') {
    const document = await cloneDocumentFromGlb(session.originalGlb)
    const glb = session.originalGlb.slice(0)
    updateWorkingGlb(glb, document)
    const stats = inspectDocument(document, {
      fileName: session.fileName,
      fileSizeBytes: glb.byteLength,
      format: session.format,
    })
    return { glb, stats, appliedOps: [], durationMs: performance.now() - t0 }
  }

  if (steps.length === 0) {
    const document = await cloneDocumentFromGlb(session.workingGlb)
    const stats = inspectDocument(document, {
      fileName: session.fileName,
      fileSizeBytes: session.workingGlb.byteLength,
      format: session.format,
    })
    return {
      glb: session.workingGlb,
      stats,
      appliedOps: appliedOpsMerge ?? [],
      durationMs: performance.now() - t0,
    }
  }

  ctx.onLog?.('info', `Base: ${base} · Pipeline: ${steps.map((s) => s.op).join(' → ')}`)
  const document = await cloneDocumentFromGlb(sourceGlb)

  await runPipelineOnDocument(document, steps, {
    ...ctx,
    maxTextureSize: settings.maxTextureSize,
    simplifyRatio: settings.simplifyRatio,
    simplifyError: settings.simplifyError,
    textureFormat: settings.textureFormat,
  })

  if (ctx.signal?.aborted) {
    throw new DOMException('Operación cancelada', 'AbortError')
  }

  const glb = await writeDocumentToGlb(document)
  updateWorkingGlb(glb, document)

  const stats = inspectDocument(document, {
    fileName: session.fileName,
    fileSizeBytes: glb.byteLength,
    format: session.format,
  })

  const applied =
    base === 'original'
      ? steps.map((s) => s.op)
      : [...new Set([...(appliedOpsMerge ?? []), ...steps.map((s) => s.op)])]

  return {
    glb,
    stats,
    appliedOps: applied,
    durationMs: performance.now() - t0,
  }
}

/** @deprecated usar runOptimization */
export async function runOptimizationFromOriginal(
  settings: OptimizationSettings,
  stepsOverride: PipelineStep[] | null,
  ctx: OpContext,
): Promise<OptimizationResult> {
  return runOptimization(settings, stepsOverride, ctx, 'original')
}
