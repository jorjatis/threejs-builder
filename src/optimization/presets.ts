import type {
  OptimizationOpId,
  OptimizationSettings,
  PipelineDefinition,
  PipelineStep,
} from '../types'
import { sortPipelineSteps } from './operations'

export interface OptimizationPreset {
  id: string
  name: string
  description: string
  /** Ops a activar en modo sencillo (sin texturas: van al panel Texturas). */
  enableOps: OptimizationOpId[]
  simplifyRatio?: number
  simplifyError?: number
  maxTextureSize?: number
  textureFormat?: OptimizationSettings['textureFormat']
  geometryCompression: OptimizationSettings['geometryCompression']
  meshoptLevel?: 'medium' | 'high'
  /** Pipeline completo para modo avanzado (puede incluir texturas). */
  pipeline: PipelineDefinition
}

export const OPTIMIZATION_PRESETS: OptimizationPreset[] = [
  {
    id: 'clean',
    name: 'Limpieza segura',
    description: 'Sin pérdida visual: deduplicar, soldar, podar y reordenar. Ideal como primer paso.',
    enableOps: ['dedup', 'weld', 'prune', 'reorder'],
    geometryCompression: 'none',
    pipeline: {
      name: 'Limpieza segura',
      steps: [{ op: 'dedup' }, { op: 'weld' }, { op: 'prune' }, { op: 'reorder' }],
    },
  },
  {
    id: 'balanced',
    name: 'Equilibrado (web)',
    description: 'Buen equilibrio tamaño / calidad para piezas editoriales embebidas.',
    enableOps: ['dedup', 'weld', 'simplify', 'resample', 'prune', 'sparse', 'reorder', 'meshopt'],
    simplifyRatio: 0.7,
    simplifyError: 0.001,
    geometryCompression: 'meshopt',
    meshoptLevel: 'medium',
    maxTextureSize: 1024,
    textureFormat: 'webp',
    pipeline: {
      name: 'Equilibrado (web)',
      steps: [
        { op: 'dedup' },
        { op: 'weld' },
        { op: 'simplify', params: { ratio: 0.7, error: 0.001 } },
        { op: 'resample' },
        { op: 'prune' },
        { op: 'sparse', params: { ratio: 0.2 } },
        { op: 'reorder' },
        { op: 'textureResize', params: { maxSize: 1024 } },
        { op: 'textureCompress', params: { format: 'webp' } },
        { op: 'meshopt', params: { level: 'medium' } },
      ],
    },
  },
  {
    id: 'light',
    name: 'Poco peso',
    description: 'Prioriza tamaño (móvil / conexiones lentas). Más agresivo con mallas y texturas.',
    enableOps: ['dedup', 'prune', 'weld', 'simplify', 'resample', 'sparse', 'reorder', 'meshopt'],
    simplifyRatio: 0.4,
    simplifyError: 0.002,
    geometryCompression: 'meshopt',
    meshoptLevel: 'high',
    maxTextureSize: 512,
    textureFormat: 'webp',
    pipeline: {
      name: 'Poco peso',
      steps: [
        { op: 'dedup' },
        { op: 'prune' },
        { op: 'weld' },
        { op: 'simplify', params: { ratio: 0.4, error: 0.002 } },
        { op: 'resample' },
        { op: 'sparse', params: { ratio: 0.15 } },
        { op: 'reorder' },
        { op: 'textureResize', params: { maxSize: 512 } },
        { op: 'textureCompress', params: { format: 'webp' } },
        { op: 'meshopt', params: { level: 'high' } },
      ],
    },
  },
  {
    id: 'quality',
    name: 'Máxima calidad',
    description: 'Casi sin tocar la forma: limpieza + compresión meshopt suave. Sin simplificar.',
    enableOps: ['dedup', 'weld', 'prune', 'resample', 'reorder', 'meshopt'],
    geometryCompression: 'meshopt',
    meshoptLevel: 'medium',
    maxTextureSize: 2048,
    textureFormat: 'webp',
    pipeline: {
      name: 'Máxima calidad',
      steps: [
        { op: 'dedup' },
        { op: 'weld' },
        { op: 'resample' },
        { op: 'prune' },
        { op: 'reorder' },
        { op: 'textureCompress', params: { format: 'webp' } },
        { op: 'meshopt', params: { level: 'medium' } },
      ],
    },
  },
]

export function formatPipelineJson(pipeline: PipelineDefinition): string {
  const steps = sortPipelineSteps(pipeline.steps)
  const stepLines = steps.map((s) => `    ${JSON.stringify(s)}`)
  return `{\n  "name": ${JSON.stringify(pipeline.name)},\n  "steps": [\n${stepLines.join(',\n')}\n  ]\n}\n`
}

export function applyPresetToSettings(
  preset: OptimizationPreset,
  current: OptimizationSettings,
): OptimizationSettings {
  const enable = new Set(preset.enableOps)
  return {
    ...current,
    simplifyRatio: preset.simplifyRatio ?? current.simplifyRatio,
    simplifyError: preset.simplifyError ?? current.simplifyError,
    maxTextureSize: preset.maxTextureSize ?? current.maxTextureSize,
    textureFormat: preset.textureFormat ?? current.textureFormat,
    geometryCompression: preset.geometryCompression,
    ops: current.ops.map((o) => {
      const step = preset.pipeline.steps.find((s) => s.op === o.id)
      const enabled = enable.has(o.id)
      return {
        ...o,
        enabled,
        params: {
          ...o.params,
          ...(step?.params ?? {}),
          ...(o.id === 'meshopt' && preset.meshoptLevel
            ? { level: preset.meshoptLevel }
            : {}),
          ...(o.id === 'simplify' && preset.simplifyRatio != null
            ? { ratio: preset.simplifyRatio, error: preset.simplifyError ?? 0.001 }
            : {}),
        },
      }
    }),
  }
}

export function presetStepsForSimple(preset: OptimizationPreset): PipelineStep[] {
  const hidden = new Set<OptimizationOpId>(['textureResize', 'textureCompress', 'palette'])
  return sortPipelineSteps(preset.pipeline.steps.filter((s) => !hidden.has(s.op)))
}
