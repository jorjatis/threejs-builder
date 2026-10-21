import type {
  ModelStats,
  OptimizationOpId,
  PipelineStep,
  TextureInfo,
} from '../types'
import { estimateTextureBytes, type TextureEncodeFormat } from '../textures/extractTextures'

export interface OptimizationEstimate {
  currentBytes: number
  estimatedBytes: number
  currentTris: number
  estimatedTris: number
  notes: string[]
}

/**
 * Heurística de ahorro antes de aplicar el pipeline (no ejecuta transforms).
 * Conservadora: mejor subestimar que prometer de más.
 */
export function estimateOptimizationImpact(
  stats: ModelStats | null,
  textures: TextureInfo[],
  steps: PipelineStep[],
): OptimizationEstimate | null {
  if (!stats || steps.length === 0) return null

  const currentBytes = stats.fileSizeBytes
  const currentTris = stats.triangles.value ?? 0
  let bytes = currentBytes
  let tris = currentTris
  const notes: string[] = []
  const ids = new Set(steps.map((s) => s.op))

  const geoShare = Math.min(
    0.55,
    Math.max(0.15, (stats.geometryMemoryBytes.value ?? currentBytes * 0.35) / Math.max(1, currentBytes)),
  )

  if (ids.has('simplify')) {
    const step = steps.find((s) => s.op === 'simplify')
    const ratio = Number(step?.params?.ratio ?? 0.5)
    const nextTris = Math.max(1, Math.round(tris * Math.min(1, Math.max(0.05, ratio))))
    const savedFrac = tris > 0 ? 1 - nextTris / tris : 0
    bytes -= currentBytes * geoShare * savedFrac * 0.55
    tris = nextTris
    notes.push(`Simplify ≈ ${Math.round(ratio * 100)}% tris`)
  }

  if (ids.has('textureResize') || ids.has('textureCompress')) {
    const resize = steps.find((s) => s.op === 'textureResize')
    const compress = steps.find((s) => s.op === 'textureCompress')
    const maxSize = Number(resize?.params?.maxSize ?? 2048)
    const format = (compress?.params?.format as TextureEncodeFormat | 'keep' | undefined) ?? 'keep'
    const { current, estimated } = estimateTextureBytes(textures, {
      maxSize,
      format: format === 'keep' && !compress ? 'keep' : format === 'keep' ? 'webp' : format,
      quality: 0.8,
    })
    if (current > 0) {
      const texDelta = Math.max(0, current - estimated)
      bytes -= texDelta * 0.85
      notes.push(
        ids.has('textureCompress')
          ? `Texturas resize/compress ≈ −${Math.round((texDelta / Math.max(1, current)) * 100)}%`
          : `Texturas resize ≈ −${Math.round((texDelta / Math.max(1, current)) * 100)}%`,
      )
    }
  }

  if (ids.has('meshopt')) {
    bytes -= currentBytes * geoShare * 0.35
    notes.push('Meshopt ≈ −35% geo')
  } else if (ids.has('draco')) {
    bytes -= currentBytes * geoShare * 0.45
    notes.push('Draco ≈ −45% geo')
  }

  if (ids.has('dedup') || ids.has('prune')) {
    bytes -= currentBytes * 0.03
    notes.push('Dedup/prune ≈ −3%')
  }
  if (ids.has('weld') || ids.has('join') || ids.has('flatten')) {
    bytes -= currentBytes * geoShare * 0.04
  }
  if (ids.has('resample')) {
    bytes -= currentBytes * 0.02
    notes.push('Resample anim ≈ −2%')
  }
  if (ids.has('sparse')) {
    bytes -= currentBytes * 0.015
    notes.push('Sparse ≈ −1–2%')
  }
  if (ids.has('instance')) {
    notes.push('Instance: baja draw calls (tamaño ≈ igual)')
  }
  if (ids.has('palette')) {
    bytes -= currentBytes * 0.02
    notes.push('Palette ≈ −2% (variable)')
  }
  if (ids.has('reorder')) {
    notes.push('Reorder: sin cambio de tamaño relevante')
  }

  const estimatedBytes = Math.max(Math.round(currentBytes * 0.12), Math.round(bytes))
  return {
    currentBytes,
    estimatedBytes: Math.min(currentBytes, estimatedBytes),
    currentTris,
    estimatedTris: Math.min(currentTris, Math.max(0, Math.round(tris))),
    notes,
  }
}

export function estimateLabel(est: OptimizationEstimate): string {
  const dBytes = est.currentBytes - est.estimatedBytes
  const pct =
    est.currentBytes > 0 ? Math.round((dBytes / est.currentBytes) * 1000) / 10 : 0
  const dTris = est.currentTris - est.estimatedTris
  const parts: string[] = []
  if (dBytes > 512) parts.push(`≈ −${formatApproxBytes(dBytes)} (${pct > 0 ? `−${pct}%` : '0%'})`)
  else parts.push('tamaño ≈ igual')
  if (dTris > 0) parts.push(`≈ −${dTris.toLocaleString('es-ES')} tris`)
  return parts.join(' · ')
}

function formatApproxBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

export type { OptimizationOpId }
