import type { ModelStats, PerformanceAlert, PerformanceBudget, OptimizationOpId } from '../types'

const OP_LABELS: Record<string, string> = {
  textureResize: 'Reducir resolución de texturas',
  textureCompress: 'Comprimir texturas (WebP)',
  simplify: 'Simplificar geometría',
  meshopt: 'Compresión Meshopt',
  weld: 'Soldar vértices',
  join: 'Fusionar mallas',
  flatten: 'Aplanar jerarquía',
  dedup: 'Eliminar duplicados',
  prune: 'Eliminar no usados',
  instance: 'Instancing GPU',
  palette: 'Paleta de materiales',
  resample: 'Remuestrear animaciones',
  sparse: 'Accessors sparse',
}

export function describeOps(ops?: OptimizationOpId[]): string {
  if (!ops?.length) return ''
  return ops.map((op) => OP_LABELS[op] || op).join(' · ')
}

export function analyzePerformance(
  stats: ModelStats | null,
  budget: PerformanceBudget,
  fileSizeBytes: number | null,
): PerformanceAlert[] {
  if (!stats) return []
  const alerts: PerformanceAlert[] = []
  const size = fileSizeBytes ?? stats.fileSizeBytes
  const tris = stats.triangles.value ?? 0
  const mats = stats.materials.value ?? 0
  const maxTex = Math.max(0, ...stats.textureDimensions.map((d) => Math.max(d.width, d.height)))

  if (size > budget.maxFileSizeBytes) {
    alerts.push({
      id: 'size',
      severity: 'error',
      title: 'Archivo demasiado pesado',
      message: `${(size / 1024 / 1024).toFixed(2)} MB supera el límite de ${(budget.maxFileSizeBytes / 1024 / 1024).toFixed(1)} MB. Baja texturas en el panel Texturas y en Optimización prueba: ${describeOps(['simplify', 'meshopt'])}.`,
      confirmed: true,
      suggestedOps: ['simplify', 'meshopt'],
    })
  }

  if (tris > budget.maxTriangles) {
    alerts.push({
      id: 'tris',
      severity: 'error',
      title: 'Demasiados triángulos',
      message: `${tris.toLocaleString('es-ES')} tris (máx. ${budget.maxTriangles.toLocaleString('es-ES')}). En Optimización activa «Simplificar geometría» y baja el ratio (p. ej. 0.5).`,
      confirmed: true,
      suggestedOps: ['simplify', 'weld', 'join'],
    })
  } else if (budget.targetDevice === 'mobile' && tris > budget.maxTriangles * 0.7) {
    alerts.push({
      id: 'tris-mobile',
      severity: 'warning',
      title: 'Carga geométrica alta para móvil',
      message: 'Estás cerca del límite. Considera simplificar un poco más antes de publicar.',
      confirmed: false,
      suggestedOps: ['simplify'],
    })
  }

  if (maxTex > budget.maxTextureResolution) {
    alerts.push({
      id: 'texres',
      severity: 'warning',
      title: 'Texturas de alta resolución',
      message: `Hay mapas de ${maxTex}px. En el panel Texturas usa «Aplicar a todas» con máximo ${budget.maxTextureResolution}px y comprime a WebP.`,
      confirmed: true,
      suggestedOps: [],
    })
  }

  if (mats > budget.maxMaterials) {
    alerts.push({
      id: 'mats',
      severity: 'warning',
      title: 'Muchos materiales',
      message: `${mats} materiales (máx. ${budget.maxMaterials}). Activa «Eliminar duplicados» / «Fusionar mallas» si hay materiales idénticos.`,
      confirmed: true,
      suggestedOps: ['dedup', 'join'],
    })
  }

  if (stats.extensions.includes('EXT_meshopt_compression')) {
    alerts.push({
      id: 'ext-meshopt',
      severity: 'info',
      title: 'Meshopt ya aplicado en el archivo',
      message:
        'El GLB usa EXT_meshopt_compression. En tu web destino importa MeshoptDecoder (three/addons/libs/meshopt_decoder.module.js) y asígnalo al GLTFLoader. No es un fallo: es un requisito del visor publicado.',
      confirmed: true,
    })
  } else {
    alerts.push({
      id: 'hint-meshopt',
      severity: 'info',
      title: 'Cómo activar Meshopt',
      message:
        'Ve a Optimización → Compresión → «Compresión Meshopt». Reduce el peso del GLB. Luego el módulo exportado / tu GLTFLoader necesitará MeshoptDecoder.',
      confirmed: false,
      suggestedOps: ['meshopt'],
    })
  }

  if (stats.extensions.includes('KHR_draco_mesh_compression')) {
    alerts.push({
      id: 'ext-draco',
      severity: 'info',
      title: 'Archivo con Draco',
      message:
        'El modelo ya viene con Draco. El visor del editor lo decodifica; al publicar usa DRACOLoader.',
      confirmed: true,
    })
  }

  const drawCalls = stats.drawCalls.value
  if (drawCalls != null && drawCalls > 50 && budget.targetDevice === 'mobile') {
    alerts.push({
      id: 'draws',
      severity: 'warning',
      title: 'Muchos draw calls',
      message: `${drawCalls} draw calls. Prueba «Aplanar jerarquía» + «Fusionar mallas compatibles».`,
      confirmed: true,
      suggestedOps: ['join', 'flatten'],
    })
  }

  return alerts
}

export function budgetChecklist(
  stats: ModelStats | null,
  budget: PerformanceBudget,
  fileSizeBytes: number | null,
): { label: string; ok: boolean; detail: string }[] {
  if (!stats) return []
  const size = fileSizeBytes ?? stats.fileSizeBytes
  const maxTex = Math.max(0, ...stats.textureDimensions.map((d) => Math.max(d.width, d.height)))
  return [
    {
      label: 'Tamaño de archivo',
      ok: size <= budget.maxFileSizeBytes,
      detail: `${(size / 1024 / 1024).toFixed(2)} / ${(budget.maxFileSizeBytes / 1024 / 1024).toFixed(1)} MB`,
    },
    {
      label: 'Triángulos',
      ok: (stats.triangles.value ?? 0) <= budget.maxTriangles,
      detail: `${(stats.triangles.value ?? 0).toLocaleString('es-ES')} / ${budget.maxTriangles.toLocaleString('es-ES')}`,
    },
    {
      label: 'Resolución de textura',
      ok: maxTex <= budget.maxTextureResolution || maxTex === 0,
      detail: `${maxTex || '—'} / ${budget.maxTextureResolution} px`,
    },
    {
      label: 'Materiales',
      ok: (stats.materials.value ?? 0) <= budget.maxMaterials,
      detail: `${stats.materials.value ?? '—'} / ${budget.maxMaterials}`,
    },
  ]
}
