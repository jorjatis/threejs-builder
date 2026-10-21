import type { Document, Transform } from '@gltf-transform/core'
import {
  dedup,
  prune,
  flatten,
  join,
  weld,
  reorder,
  simplify,
  meshopt,
  draco,
  textureCompress,
  instance,
  palette,
  resample,
  sparse,
} from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer'
import { isDracoTransformAvailable } from '../../model/gltfIo'
import type { OptimizationOpId, PipelineStep, ConsoleLogLevel } from '../../types'

export interface OpContext {
  signal?: AbortSignal
  onLog?: (level: ConsoleLogLevel, message: string, details?: string) => void
  maxTextureSize?: number
  simplifyRatio?: number
  simplifyError?: number
  textureFormat?: 'webp' | 'jpeg' | 'png' | 'keep'
  meshoptLevel?: 'medium' | 'high'
  dracoMethod?: 'edgebreaker' | 'sequential'
  instanceMin?: number
  paletteMin?: number
  sparseRatio?: number
}

export interface OpDefinition {
  id: OptimizationOpId
  name: string
  description: string
  lossy: boolean
  category: 'geometry' | 'materials' | 'textures' | 'compression'
  build: (ctx: OpContext) => Promise<Transform | Transform[]>
}

async function ensureSimplifierReady() {
  await MeshoptSimplifier.ready
}

async function ensureEncoderReady() {
  await MeshoptEncoder.ready
}

/** Redimensiona texturas por encima de maxSize usando el encoder canvas del navegador. */
function buildTextureResize(maxSize: number): Transform {
  return textureCompress({
    resize: [maxSize, maxSize],
    // Sin sharp: usa fallback del navegador (Canvas). Calidad limitada pero real.
  })
}

function buildTextureCompress(format: 'webp' | 'jpeg' | 'png'): Transform {
  return textureCompress({
    targetFormat: format,
  })
}

export const OPERATIONS: OpDefinition[] = [
  {
    id: 'dedup',
    name: 'Eliminar duplicados',
    description: 'Elimina accessors, mallas, texturas y materiales duplicados byte a byte.',
    lossy: false,
    category: 'geometry',
    build: async () => dedup(),
  },
  {
    id: 'instance',
    name: 'Instancing GPU',
    description:
      'Agrupa en EXT_mesh_gpu_instancing mallas repetidas (mín. N usos). Baja draw calls si hay repetición.',
    lossy: false,
    category: 'geometry',
    build: async (ctx) => instance({ min: ctx.instanceMin ?? 5 }),
  },
  {
    id: 'palette',
    name: 'Paleta de materiales',
    description:
      'Fusiona materiales compatibles en texturas paleta (mín. N). Puede alterar el look; úsala con cuidado.',
    lossy: true,
    category: 'materials',
    build: async (ctx) => palette({ min: ctx.paletteMin ?? 5 }),
  },
  {
    id: 'flatten',
    name: 'Aplanar jerarquía',
    description: 'Aplana el grafo de nodos dejando mallas como hijas directas de la escena.',
    lossy: false,
    category: 'geometry',
    build: async () => flatten(),
  },
  {
    id: 'join',
    name: 'Fusionar mallas compatibles',
    description: 'Une primitivas compatibles para reducir draw calls. No fusiona materiales distintos.',
    lossy: false,
    category: 'geometry',
    build: async () => join(),
  },
  {
    id: 'weld',
    name: 'Soldar vértices',
    description: 'Fusiona vértices coincidentes para compactar geometría.',
    lossy: false,
    category: 'geometry',
    build: async () => weld(),
  },
  {
    id: 'simplify',
    name: 'Simplificar geometría',
    description:
      'Reduce triángulos con MeshoptSimplifier (lockBorder para no abrir bordes UV). Con pérdida.',
    lossy: true,
    category: 'geometry',
    build: async (ctx) => {
      await ensureSimplifierReady()
      return simplify({
        simplifier: MeshoptSimplifier,
        ratio: ctx.simplifyRatio ?? 0.5,
        error: ctx.simplifyError ?? 0.001,
        lockBorder: true,
      })
    },
  },
  {
    id: 'resample',
    name: 'Remuestrear animaciones',
    description: 'Reduce keyframes de animación de forma sin pérdida. No hace nada si no hay clips.',
    lossy: false,
    category: 'geometry',
    build: async () => resample(),
  },
  {
    id: 'prune',
    name: 'Eliminar no usados',
    description: 'Elimina propiedades no referenciadas por ninguna escena.',
    lossy: false,
    category: 'materials',
    build: async () => prune(),
  },
  {
    id: 'sparse',
    name: 'Accessors sparse',
    description:
      'Usa accessors sparse cuando hay muchos ceros (ratio de no-cero bajo). Suele ahorrar unos KB sin pérdida.',
    lossy: false,
    category: 'geometry',
    build: async (ctx) => sparse({ ratio: ctx.sparseRatio ?? 0.2 }),
  },
  {
    id: 'reorder',
    name: 'Reordenar índices',
    description: 'Reordena vértices/índices para mejorar localidad de caché (Meshopt).',
    lossy: false,
    category: 'geometry',
    build: async () => {
      await ensureEncoderReady()
      return reorder({ encoder: MeshoptEncoder })
    },
  },
  {
    id: 'textureResize',
    name: 'Reducir resolución de texturas',
    description: 'Limita el lado mayor de cada textura al máximo configurado (Canvas en navegador).',
    lossy: true,
    category: 'textures',
    build: async (ctx) => buildTextureResize(ctx.maxTextureSize ?? 2048),
  },
  {
    id: 'textureCompress',
    name: 'Comprimir texturas',
    description:
      'Convierte texturas a WebP/JPEG/PNG con el encoder del navegador. No usa sharp (solo Node). KTX2/Basis no está activado en esta build.',
    lossy: true,
    category: 'textures',
    build: async (ctx) => {
      const format = ctx.textureFormat ?? 'webp'
      if (format === 'keep') {
        return async () => {
          /* no-op */
        }
      }
      return buildTextureCompress(format)
    },
  },
  {
    id: 'meshopt',
    name: 'Compresión Meshopt',
    description:
      'Aplica EXT_meshopt_compression. Incompatible con Draco en el mismo archivo. Requiere MeshoptDecoder al visualizar.',
    lossy: false,
    category: 'compression',
    build: async (ctx) => {
      await ensureEncoderReady()
      return meshopt({ encoder: MeshoptEncoder, level: ctx.meshoptLevel ?? 'medium' })
    },
  },
  {
    id: 'draco',
    name: 'Compresión Draco',
    description:
      'Aplica KHR_draco_mesh_compression (WASM en el navegador). Incompatible con Meshopt en el mismo archivo. Al publicar necesitas DRACOLoader. Es lossy en cuantización de atributos.',
    lossy: true,
    category: 'compression',
    build: async (ctx) => {
      if (!isDracoTransformAvailable()) {
        throw new Error(
          'Draco WASM no cargó. Comprueba public/draco/draco_encoder.* o usa Meshopt.',
        )
      }
      return draco({ method: ctx.dracoMethod ?? 'edgebreaker' })
    },
  },
]

export const OP_BY_ID = Object.fromEntries(OPERATIONS.map((o) => [o.id, o])) as Record<
  OptimizationOpId,
  OpDefinition
>

/** Orden recomendado (alineado con gltf.report / glTF Transform). */
export const CANONICAL_OP_ORDER: OptimizationOpId[] = [
  'dedup',
  'instance',
  'palette',
  'flatten',
  'join',
  'weld',
  'simplify',
  'resample',
  'prune',
  'sparse',
  'textureResize',
  'textureCompress',
  'reorder',
  'meshopt',
  'draco',
]

const CANONICAL_INDEX = Object.fromEntries(
  CANONICAL_OP_ORDER.map((id, i) => [id, i]),
) as Record<OptimizationOpId, number>

/** Reordena pasos al orden canónico; conserva el primero de cada op (dedupe). */
export function sortPipelineSteps(steps: PipelineStep[]): PipelineStep[] {
  const seen = new Set<string>()
  const unique: PipelineStep[] = []
  for (const step of steps) {
    if (seen.has(step.op)) continue
    seen.add(step.op)
    unique.push(step)
  }
  return unique.sort(
    (a, b) => (CANONICAL_INDEX[a.op] ?? 999) - (CANONICAL_INDEX[b.op] ?? 999),
  )
}

export function pipelineOrderWarnings(steps: PipelineStep[]): string[] {
  const warnings: string[] = []
  let lastIdx = -1
  for (const step of steps) {
    const idx = CANONICAL_INDEX[step.op]
    if (idx == null) continue
    if (idx < lastIdx) {
      warnings.push(
        `Orden poco habitual: «${step.op}» debería ir antes según el orden recomendado (dedup → … → meshopt/draco).`,
      )
      break
    }
    lastIdx = idx
  }
  const ids = steps.map((s) => s.op)
  if (ids.includes('meshopt') && ids.includes('reorder')) {
    const r = ids.indexOf('reorder')
    const m = ids.indexOf('meshopt')
    if (r > m) {
      warnings.push('«reorder» debería ir antes de Meshopt para aprovechar mejor la compresión.')
    }
  }
  if (ids.includes('simplify') && ids.includes('weld')) {
    const w = ids.indexOf('weld')
    const s = ids.indexOf('simplify')
    if (w > s) {
      warnings.push('Conviene soldar vértices (weld) antes de simplificar.')
    }
  }
  return warnings
}

export function validatePipelineSteps(steps: PipelineStep[]): {
  ok: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set(steps.map((s) => s.op))

  for (const step of steps) {
    if (!OP_BY_ID[step.op]) {
      errors.push(`Operación desconocida: ${step.op}`)
    }
  }

  if (ids.has('meshopt') && ids.has('draco')) {
    errors.push('Meshopt y Draco no deben aplicarse juntos. Elige una sola compresión de geometría.')
  }
  if (ids.has('draco') && !isDracoTransformAvailable()) {
    warnings.push(
      'Draco se aplicará al exportar/optimizar solo si el WASM del encoder está disponible.',
    )
  }

  if (ids.has('simplify')) {
    warnings.push('La simplificación es irreversible y puede alterar siluetas y UVs.')
  }

  warnings.push(...pipelineOrderWarnings(steps))

  return { ok: errors.length === 0, errors, warnings }
}

export async function runPipelineOnDocument(
  document: Document,
  steps: PipelineStep[],
  ctx: OpContext,
): Promise<Document> {
  const validation = validatePipelineSteps(steps)
  for (const w of validation.warnings) ctx.onLog?.('warn', w)
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'))
  }

  for (const step of steps) {
    if (ctx.signal?.aborted) {
      throw new DOMException('Operación cancelada', 'AbortError')
    }
    const def = OP_BY_ID[step.op]
    const p = step.params ?? {}
    const stepCtx: OpContext = {
      ...ctx,
      simplifyRatio:
        step.op === 'simplify' ? ((p.ratio as number) ?? ctx.simplifyRatio) : ctx.simplifyRatio,
      simplifyError:
        step.op === 'simplify' ? ((p.error as number) ?? ctx.simplifyError) : ctx.simplifyError,
      maxTextureSize:
        step.op === 'textureResize' ? ((p.maxSize as number) ?? ctx.maxTextureSize) : ctx.maxTextureSize,
      textureFormat:
        step.op === 'textureCompress'
          ? ((p.format as OpContext['textureFormat']) ?? ctx.textureFormat)
          : ctx.textureFormat,
      meshoptLevel:
        step.op === 'meshopt' ? ((p.level as OpContext['meshoptLevel']) ?? ctx.meshoptLevel) : ctx.meshoptLevel,
      dracoMethod:
        step.op === 'draco' ? ((p.method as OpContext['dracoMethod']) ?? ctx.dracoMethod) : ctx.dracoMethod,
      instanceMin:
        step.op === 'instance' ? ((p.min as number) ?? ctx.instanceMin) : ctx.instanceMin,
      paletteMin: step.op === 'palette' ? ((p.min as number) ?? ctx.paletteMin) : ctx.paletteMin,
      sparseRatio:
        step.op === 'sparse' ? ((p.ratio as number) ?? ctx.sparseRatio) : ctx.sparseRatio,
    }

    const t0 = performance.now()
    ctx.onLog?.('info', `Iniciando: ${def.name}`)
    const built = await def.build(stepCtx)
    const transforms = Array.isArray(built) ? built : [built]
    await document.transform(...transforms)
    ctx.onLog?.('success', `Completado: ${def.name}`, undefined)
    ctx.onLog?.('debug', `${def.name} en ${(performance.now() - t0).toFixed(0)} ms`)
  }

  return document
}
