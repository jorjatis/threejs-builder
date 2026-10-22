import type {
  OptimizationOpId,
  OptimizationSettings,
  PerformanceBudget,
  SceneConfig,
} from '../types'
import { applyPresetToSettings } from '../optimization/presets'
import { createDefaultOptimizationSettings } from '../scene-config/defaults'

export interface GlobalPreset {
  id: string
  name: string
  description: string
  /** Parcial de escena (interacción, cámara, entorno…). */
  scene: Partial<SceneConfig>
  budget: Partial<PerformanceBudget>
  /** Ajustes de optimización / texturas a aplicar. */
  optimization: {
    enableOps: OptimizationOpId[]
    simplifyRatio?: number
    simplifyError?: number
    maxTextureSize?: number
    textureFormat?: OptimizationSettings['textureFormat']
    geometryCompression: OptimizationSettings['geometryCompression']
    meshoptLevel?: 'medium' | 'high'
  }
}

/**
 * Presets globales para embebidos en artículo web:
 * sin zoom (no roba el scroll), sin pan, fondo transparente, peso acotado.
 */
export const GLOBAL_PRESETS: GlobalPreset[] = [
  {
    id: 'web-orbit-no-underside',
    name: 'Web · órbita (sin suelo)',
    description:
      'Fondo transparente, sin zoom ni desplazamiento. Rota en ambos ejes pero no se ve desde abajo. Texturas ≤512 y compresión suave.',
    scene: {
      environment: {
        background: '#ffffff00',
        exposure: 1,
        showGrid: false,
        showAxes: false,
        maxPixelRatio: 2,
      },
      container: {
        widthValue: 100,
        widthUnit: '%',
        heightValue: 480,
        heightUnit: 'px',
        aspectRatio: null,
        minHeight: 240,
        maxHeight: null,
        maxWidth: 960,
        background: '#ffffff00',
        margin: 0,
        padding: 0,
        fullscreenCapable: true,
        preset: 'horizontal',
      },
      interaction: {
        preset: 'limited',
        enableRotate: true,
        enableZoom: false,
        enablePan: false,
        enableHorizontal: true,
        enableVertical: true,
        touchEnabled: true,
        reducedMotion: false,
      },
      autoRotate: {
        enabled: false,
        speed: 0.8,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 2500,
      },
      camera: {
        type: 'perspective',
        fov: 38,
        position: [0, 1.2, 3.5],
        target: [0, 0.35, 0],
        minDistance: 1.2,
        maxDistance: 8,
        // Polar: 0 = cenital, π/2 = horizonte — no pasar al hemisferio inferior
        minPolarAngle: 0.25,
        maxPolarAngle: Math.PI / 2,
        minAzimuthAngle: -Infinity,
        maxAzimuthAngle: Infinity,
        enableDamping: true,
        dampingFactor: 0.08,
        zoomSpeed: 1,
        rotateSpeed: 0.75,
        panSpeed: 0.5,
        near: 0.1,
        far: 2000,
      },
    },
    budget: {
      maxFileSizeBytes: 2.5 * 1024 * 1024,
      maxTriangles: 100_000,
      maxTextureResolution: 512,
      maxMaterials: 16,
      targetDevice: 'mobile',
    },
    optimization: {
      enableOps: [
        'dedup',
        'weld',
        'simplify',
        'prune',
        'reorder',
        'textureResize',
        'textureCompress',
        'meshopt',
      ],
      simplifyRatio: 0.75,
      simplifyError: 0.001,
      maxTextureSize: 512,
      textureFormat: 'webp',
      geometryCompression: 'meshopt',
      meshoptLevel: 'medium',
    },
  },
  {
    id: 'web-horizontal-only',
    name: 'Web · solo horizontal',
    description:
      'Igual que el anterior, pero solo giro izquierda/derecha (ideal para scroll de página). Texturas ≤512.',
    scene: {
      environment: {
        background: '#ffffff00',
        exposure: 1,
        showGrid: false,
        showAxes: false,
        maxPixelRatio: 2,
      },
      container: {
        widthValue: 100,
        widthUnit: '%',
        heightValue: 480,
        heightUnit: 'px',
        aspectRatio: null,
        minHeight: 240,
        maxHeight: null,
        maxWidth: 960,
        background: '#ffffff00',
        margin: 0,
        padding: 0,
        fullscreenCapable: true,
        preset: 'horizontal',
      },
      interaction: {
        preset: 'horizontal',
        enableRotate: true,
        enableZoom: false,
        enablePan: false,
        enableHorizontal: true,
        enableVertical: false,
        touchEnabled: true,
        reducedMotion: false,
      },
      autoRotate: {
        enabled: false,
        speed: 0.6,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 3000,
      },
      camera: {
        type: 'perspective',
        fov: 38,
        position: [0, 1.2, 3.5],
        target: [0, 0.35, 0],
        minDistance: 1.2,
        maxDistance: 8,
        minPolarAngle: Math.PI * 0.42,
        maxPolarAngle: Math.PI * 0.48,
        minAzimuthAngle: -Infinity,
        maxAzimuthAngle: Infinity,
        enableDamping: true,
        dampingFactor: 0.08,
        zoomSpeed: 1,
        rotateSpeed: 0.7,
        panSpeed: 0.5,
        near: 0.1,
        far: 2000,
      },
    },
    budget: {
      maxFileSizeBytes: 2.5 * 1024 * 1024,
      maxTriangles: 100_000,
      maxTextureResolution: 512,
      maxMaterials: 16,
      targetDevice: 'mobile',
    },
    optimization: {
      enableOps: [
        'dedup',
        'weld',
        'simplify',
        'prune',
        'reorder',
        'textureResize',
        'textureCompress',
        'meshopt',
      ],
      simplifyRatio: 0.75,
      simplifyError: 0.001,
      maxTextureSize: 512,
      textureFormat: 'webp',
      geometryCompression: 'meshopt',
      meshoptLevel: 'medium',
    },
  },
]

export function buildGlobalPresetOptimization(
  preset: GlobalPreset,
  current: OptimizationSettings = createDefaultOptimizationSettings(),
): OptimizationSettings {
  const enable = new Set(preset.optimization.enableOps)
  const base = applyPresetToSettings(
    {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      enableOps: preset.optimization.enableOps,
      simplifyRatio: preset.optimization.simplifyRatio,
      simplifyError: preset.optimization.simplifyError,
      maxTextureSize: preset.optimization.maxTextureSize,
      textureFormat: preset.optimization.textureFormat,
      geometryCompression: preset.optimization.geometryCompression ?? 'meshopt',
      meshoptLevel: preset.optimization.meshoptLevel,
      pipeline: {
        name: preset.name,
        steps: preset.optimization.enableOps.map((op) => ({ op })),
      },
    },
    current,
  )
  // Asegurar texturas activas (applyPresetToSettings del modo sencillo a veces las omite)
  return {
    ...base,
    maxTextureSize: preset.optimization.maxTextureSize ?? 512,
    textureFormat: preset.optimization.textureFormat ?? 'webp',
    ops: base.ops.map((o) => ({
      ...o,
      enabled: enable.has(o.id),
      ...(o.id === 'meshopt' && preset.optimization.meshoptLevel
        ? { params: { ...o.params, level: preset.optimization.meshoptLevel } }
        : {}),
    })),
  }
}
