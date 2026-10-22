import type {
  ModelStats,
  OptimizationOpId,
  OptimizationSettings,
  TextureInfo,
} from '../types'

export type OpUsefulness = 'useful' | 'limited' | 'skip' | 'done' | 'conflict'

export interface OpRelevance {
  usefulness: OpUsefulness
  /** Frase corta bajo el nombre (estado respecto al modelo actual). */
  hint: string
  badge?: string
  badgeTone?: 'ok' | 'info' | 'lossy' | 'err'
}

export interface ModelOpContext {
  original: ModelStats | null
  current: ModelStats | null
  textures: TextureInfo[]
  settings: OptimizationSettings
  appliedOps: OptimizationOpId[]
  removedCount: number
}

function maxSide(dims: { width: number; height: number }[]): number {
  let m = 0
  for (const d of dims) m = Math.max(m, d.width, d.height)
  return m
}

/** Detecta ediciones de texturas hechas fuera del pipeline (panel Texturas, etc.). */
export function detectManualTextureEdits(ctx: ModelOpContext): {
  changed: boolean
  summary: string
} {
  const { original, current, textures, appliedOps, removedCount } = ctx
  if (!original || !current) return { changed: false, summary: '' }

  const viaPipeline =
    appliedOps.includes('textureResize') || appliedOps.includes('textureCompress')

  const origMax = maxSide(original.textureDimensions)
  const curMax = maxSide(current.textureDimensions)
  const origCount = original.textures.value ?? 0
  const curCount = current.textures.value ?? textures.filter((t) => t.active).length
  const dimsDiffer =
    original.textureDimensions.length !== current.textureDimensions.length ||
    original.textureDimensions.some((d, i) => {
      const c = current.textureDimensions[i]
      return !c || c.width !== d.width || c.height !== d.height
    }) ||
    origMax !== curMax

  const countDiffer = origCount !== curCount || removedCount > 0
  const oversizedNow = textures.filter(
    (t) => t.active && Math.max(t.width, t.height) > ctx.settings.maxTextureSize,
  ).length

  // Cambios de textura no explicados solo por ops del pipeline, o hay eliminadas
  const changed = (dimsDiffer || countDiffer) && (!viaPipeline || removedCount > 0)

  if (!changed && !dimsDiffer && removedCount === 0) {
    return { changed: false, summary: '' }
  }

  const parts: string[] = []
  if (dimsDiffer) {
    parts.push(
      origMax > curMax
        ? `resolución bajada (${origMax}px → ${curMax || '—'}px)`
        : `resoluciones distintas al original`,
    )
  }
  if (removedCount > 0) parts.push(`${removedCount} eliminada(s) pendientes de restaurar`)
  if (countDiffer && removedCount === 0) parts.push(`nº de texturas ${origCount} → ${curCount}`)
  if (viaPipeline) parts.push('también hay ops de textura del pipeline')
  if (oversizedNow === 0 && origMax > ctx.settings.maxTextureSize) {
    parts.push(`ninguna supera ya ${ctx.settings.maxTextureSize}px`)
  }

  return {
    changed: dimsDiffer || countDiffer || removedCount > 0,
    summary: parts.join(' · '),
  }
}

export function getOpRelevance(opId: OptimizationOpId, ctx: ModelOpContext): OpRelevance {
  const { original, current, textures, settings, appliedOps } = ctx
  const stats = current ?? original
  const applied = appliedOps.includes(opId)
  const active = textures.filter((t) => t.active)
  const maxTex = settings.maxTextureSize
  const oversized = active.filter((t) => Math.max(t.width, t.height) > maxTex).length
  const nonWebp = active.filter((t) => {
    const m = (t.mimeType || t.format || '').toLowerCase()
    return !m.includes('webp')
  }).length
  const tris = stats?.triangles.value ?? 0
  const meshes = stats?.meshes.value ?? 0
  const nodes = stats?.nodes.value ?? 0
  const primitives = stats?.primitives.value ?? 0
  const mats = stats?.materials.value ?? 0
  const anims = stats?.animations.value ?? 0
  const texCount = stats?.textures.value ?? active.length
  const exts = stats?.extensions ?? []
  const hasMeshopt = exts.some((e) => e.toLowerCase().includes('meshopt'))
  const hasDraco = exts.some((e) => e.toLowerCase().includes('draco'))
  const hasInstancing = exts.some((e) => e.toLowerCase().includes('instancing'))

  if (applied) {
    const base: OpRelevance = {
      usefulness: 'done',
      hint: 'Ya aplicada en este modelo de trabajo.',
      badge: 'aplicada',
      badgeTone: 'ok',
    }
    // Matizar texturas
    if (opId === 'textureResize' && oversized === 0) {
      return {
        ...base,
        hint: `Aplicada. Ninguna textura activa supera ${maxTex}px.`,
      }
    }
    return base
  }

  switch (opId) {
    case 'dedup':
      return {
        usefulness: 'useful',
        hint: 'Quita recursos idénticos. Seguro y suele ahorrar algo en modelos exportados.',
        badge: 'recomendado',
        badgeTone: 'info',
      }
    case 'instance':
      if (hasInstancing) {
        return {
          usefulness: 'limited',
          hint: 'El archivo ya declara instancing GPU.',
          badge: 'ya presente',
          badgeTone: 'ok',
        }
      }
      if (meshes < 5) {
        return {
          usefulness: 'skip',
          hint: `Solo ${meshes} mallas: hace falta la misma malla repetida ≥5 veces.`,
          badge: 'poco útil',
          badgeTone: 'err',
        }
      }
      return {
        usefulness: 'useful',
        hint: `${meshes} mallas. Útil si hay props repetidos (árboles, butacas…). Si no, no cambia nada.`,
        badge: 'si hay repetición',
        badgeTone: 'info',
      }
    case 'palette':
      if (mats < 5) {
        return {
          usefulness: 'skip',
          hint: `Solo ${mats} materiales: hace falta un grupo compatible ≥5.`,
          badge: 'poco útil',
          badgeTone: 'err',
        }
      }
      return {
        usefulness: 'limited',
        hint: `${mats} materiales. Puede reducir draw calls; también puede alterar colores/UVs.`,
        badge: 'con cuidado',
        badgeTone: 'lossy',
      }
    case 'resample':
      if (anims <= 0) {
        return {
          usefulness: 'skip',
          hint: 'Sin animaciones: no hará nada.',
          badge: 'n/a',
          badgeTone: 'err',
        }
      }
      return {
        usefulness: 'useful',
        hint: `${anims} animación(es). Remuestrea keyframes sin pérdida.`,
        badge: 'seguro',
        badgeTone: 'ok',
      }
    case 'sparse':
      return {
        usefulness: 'useful',
        hint: 'Convierte accessors densos con muchos ceros a sparse. Sin pérdida, ahorro variable.',
        badge: 'seguro',
        badgeTone: 'info',
      }
    case 'prune':
      return {
        usefulness: texCount > 0 || meshes > 0 ? 'useful' : 'limited',
        hint: 'Borra nodos/materiales/texturas sin uso. Útil tras limpiar o fusionar.',
        badge: 'seguro',
        badgeTone: 'info',
      }
    case 'flatten':
      if (nodes <= (meshes || 1) + 2) {
        return {
          usefulness: 'limited',
          hint: `Pocos nodos (${nodes}). Poco margen: la jerarquía ya es simple.`,
          badge: 'poco margen',
          badgeTone: 'lossy',
        }
      }
      return {
        usefulness: 'useful',
        hint: `${nodes} nodos / ${meshes} mallas. Aplana el grafo (pierdes jerarquía de padres).`,
        badge: 'útil',
        badgeTone: 'info',
      }
    case 'join':
      if (primitives <= meshes) {
        return {
          usefulness: 'limited',
          hint: `${primitives} primitivas / ${meshes} mallas. Pocas candidatas a fusionar.`,
          badge: 'poco margen',
          badgeTone: 'lossy',
        }
      }
      return {
        usefulness: 'useful',
        hint: `${primitives} primitivas. Une las compatibles (mismo material) y baja draw calls.`,
        badge: 'útil',
        badgeTone: 'info',
      }
    case 'weld':
      return {
        usefulness: tris > 0 ? 'useful' : 'skip',
        hint:
          tris > 0
            ? `${tris.toLocaleString('es-ES')} triángulos. Compacta vértices duplicados en aristas.`
            : 'Sin geometría detectable.',
        badge: tris > 0 ? 'útil' : 'n/a',
        badgeTone: tris > 0 ? 'info' : 'err',
      }
    case 'reorder':
      return {
        usefulness: tris > 0 ? 'useful' : 'skip',
        hint: 'Mejora caché de GPU. Ideal antes de Meshopt; no cambia la forma.',
        badge: 'seguro',
        badgeTone: 'info',
      }
    case 'simplify': {
      if (tris < 500) {
        return {
          usefulness: 'skip',
          hint: `Solo ${tris} triángulos: simplificar apenas ayuda y puede deformar.`,
          badge: 'poco útil',
          badgeTone: 'err',
        }
      }
      const keep = Math.round(tris * settings.simplifyRatio)
      return {
        usefulness: 'useful',
        hint: `Con ratio ${settings.simplifyRatio} ≈ ${keep.toLocaleString('es-ES')} triángulos (de ${tris.toLocaleString('es-ES')}). Con pérdida.`,
        badge: 'con pérdida',
        badgeTone: 'lossy',
      }
    }
    case 'textureResize': {
      if (texCount === 0) {
        return {
          usefulness: 'skip',
          hint: 'Este modelo no tiene texturas.',
          badge: 'n/a',
          badgeTone: 'err',
        }
      }
      if (oversized === 0) {
        return {
          usefulness: 'skip',
          hint: `Ninguna de las ${active.length} texturas supera ${maxTex}px. No hará casi nada (o ya las bajaste en Texturas).`,
          badge: 'ya ok',
          badgeTone: 'ok',
        }
      }
      return {
        usefulness: 'useful',
        hint: `${oversized} de ${active.length} texturas superan ${maxTex}px. Se recortarán a ese máximo.`,
        badge: `${oversized} grandes`,
        badgeTone: 'lossy',
      }
    }
    case 'textureCompress': {
      if (texCount === 0) {
        return {
          usefulness: 'skip',
          hint: 'Este modelo no tiene texturas.',
          badge: 'n/a',
          badgeTone: 'err',
        }
      }
      if (settings.textureFormat === 'keep') {
        return {
          usefulness: 'skip',
          hint: 'Formato «Mantener»: la op no convierte nada.',
          badge: 'sin efecto',
          badgeTone: 'err',
        }
      }
      if (settings.textureFormat === 'webp' && nonWebp === 0) {
        return {
          usefulness: 'limited',
          hint: 'Todas las texturas activas ya parecen WebP.',
          badge: 'ya webp',
          badgeTone: 'ok',
        }
      }
      return {
        usefulness: 'useful',
        hint: `Convierte a ${settings.textureFormat.toUpperCase()}. ${nonWebp} textura(s) aún no son WebP.`,
        badge: 'ahorro',
        badgeTone: 'info',
      }
    }
    case 'meshopt':
      if (hasDraco) {
        return {
          usefulness: 'conflict',
          hint: 'El modelo ya trae Draco. Quita Draco antes o no combines ambas.',
          badge: 'conflicto',
          badgeTone: 'err',
        }
      }
      if (hasMeshopt) {
        return {
          usefulness: 'limited',
          hint: 'Ya incluye EXT_meshopt_compression.',
          badge: 'ya presente',
          badgeTone: 'ok',
        }
      }
      return {
        usefulness: 'useful',
        hint: 'Comprime geometría sin Draco. Al publicar hace falta MeshoptDecoder.',
        badge: 'export',
        badgeTone: 'info',
      }
    case 'draco':
      if (hasMeshopt) {
        return {
          usefulness: 'conflict',
          hint: 'El modelo ya trae Meshopt. Incompatible con Draco en el mismo archivo.',
          badge: 'conflicto',
          badgeTone: 'err',
        }
      }
      if (hasDraco) {
        return {
          usefulness: 'limited',
          hint: 'Ya incluye KHR_draco_mesh_compression.',
          badge: 'ya presente',
          badgeTone: 'ok',
        }
      }
      return {
        usefulness: 'useful',
        hint: 'Compresión fuerte de mallas (con pérdida de precisión). Al publicar: DRACOLoader.',
        badge: 'export',
        badgeTone: 'info',
      }
    default:
      return { usefulness: 'useful', hint: '' }
  }
}
