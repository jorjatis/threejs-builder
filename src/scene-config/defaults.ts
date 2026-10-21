import type {
  OptimizationSettings,
  SceneConfig,
  ScenePreset,
  PerformanceBudget,
  ExportSettings,
  PipelineDefinition,
} from '../types'

export function createDefaultOptimizationSettings(): OptimizationSettings {
  return {
    geometryCompression: 'none',
    maxTextureSize: 2048,
    simplifyRatio: 0.5,
    simplifyError: 0.001,
    textureFormat: 'webp',
    ops: [
      { id: 'dedup', enabled: false, available: true, lossy: false, params: {} },
      { id: 'instance', enabled: false, available: true, lossy: false, params: { min: 5 } },
      { id: 'palette', enabled: false, available: true, lossy: true, params: { min: 5 } },
      { id: 'flatten', enabled: false, available: true, lossy: false, params: {} },
      { id: 'join', enabled: false, available: true, lossy: false, params: {} },
      { id: 'weld', enabled: false, available: true, lossy: false, params: {} },
      {
        id: 'simplify',
        enabled: false,
        available: true,
        lossy: true,
        params: { ratio: 0.5, error: 0.001 },
      },
      { id: 'resample', enabled: false, available: true, lossy: false, params: {} },
      { id: 'prune', enabled: false, available: true, lossy: false, params: {} },
      { id: 'sparse', enabled: false, available: true, lossy: false, params: { ratio: 0.2 } },
      { id: 'reorder', enabled: false, available: true, lossy: false, params: {} },
      {
        id: 'textureResize',
        enabled: false,
        available: true,
        lossy: true,
        params: { maxSize: 2048 },
      },
      {
        id: 'textureCompress',
        enabled: false,
        available: true,
        lossy: true,
        params: { format: 'webp' },
      },
      { id: 'meshopt', enabled: false, available: true, lossy: false, params: { level: 'medium' } },
      {
        id: 'draco',
        enabled: false,
        available: true,
        lossy: true,
        params: { method: 'edgebreaker' },
      },
    ],
  }
}

export function createDefaultSceneConfig(): SceneConfig {
  return {
    camera: {
      type: 'perspective',
      fov: 45,
      position: [0, 1.5, 4],
      target: [0, 0, 0],
      minDistance: 0.5,
      maxDistance: 3,
      minPolarAngle: 0,
      maxPolarAngle: Math.PI,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
      enableDamping: true,
      dampingFactor: 0.08,
      zoomSpeed: 1,
      rotateSpeed: 1,
      panSpeed: 1,
    },
    interaction: {
      preset: 'explore',
      enableRotate: true,
      enableZoom: true,
      enablePan: true,
      enableHorizontal: true,
      enableVertical: true,
      touchEnabled: true,
      reducedMotion: false,
    },
    autoRotate: {
      enabled: false,
      speed: 1,
      direction: 1,
      pauseOnInteract: true,
      resumeDelayMs: 2000,
    },
    lights: [
      {
        id: 'ambient_default',
        kind: 'ambient',
        name: 'Ambiental',
        enabled: true,
        color: '#ffffff',
        intensity: 0.45,
        source: 'editor',
      },
      {
        id: 'hemi_default',
        kind: 'hemisphere',
        name: 'Hemisférica',
        enabled: true,
        color: '#ffffff',
        intensity: 0.55,
        position: [0, 1, 0],
        source: 'editor',
      },
      {
        id: 'dir_default',
        kind: 'directional',
        name: 'Direccional',
        enabled: true,
        color: '#ffffff',
        intensity: 1.1,
        position: [5, 8, 5],
        target: [0, 0, 0],
        castShadow: false,
        source: 'editor',
      },
    ],
    environment: {
      background: '#1a1a1e',
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
      background: '#111114',
      margin: 0,
      padding: 0,
      fullscreenCapable: true,
      preset: 'horizontal',
    },
    editorial: {
      title: '',
      titleEnabled: false,
      lead: '',
      leadEnabled: false,
      textAbove: '',
      textAboveEnabled: false,
      textBelow: '',
      textBelowEnabled: false,
      caption: '',
      captionEnabled: false,
      credits: '',
      creditsEnabled: false,
      altText: '',
      altTextEnabled: true,
    },
    modelScale: 1,
    modelPosition: [0, 0, 0],
    modelRotation: [0, 0, 0],
  }
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'floating-product',
    name: 'Producto flotante',
    description: 'Solo giro horizontal lento, sin zoom ni pan. Ideal para producto editorial.',
    config: {
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
        enabled: true,
        speed: 0.6,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 3000,
      },
      camera: {
        type: 'perspective',
        fov: 40,
        position: [0, 1.2, 3.5],
        target: [0, 0.4, 0],
        minDistance: 1.5,
        maxDistance: 6,
        minPolarAngle: Math.PI * 0.45,
        maxPolarAngle: Math.PI * 0.55,
        minAzimuthAngle: -Infinity,
        maxAzimuthAngle: Infinity,
        enableDamping: true,
        dampingFactor: 0.08,
        zoomSpeed: 1,
        rotateSpeed: 0.7,
        panSpeed: 0.5,
      },
    },
  },
  {
    id: 'rotating-object',
    name: 'Objeto en rotación',
    description: 'Auto-rotación más rápida con zoom; el usuario puede orbitar en ambos ejes.',
    config: {
      interaction: {
        preset: 'free',
        enableRotate: true,
        enableZoom: true,
        enablePan: false,
        enableHorizontal: true,
        enableVertical: true,
        touchEnabled: true,
        reducedMotion: false,
      },
      autoRotate: {
        enabled: true,
        speed: 1.8,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 1200,
      },
      camera: {
        type: 'perspective',
        fov: 45,
        position: [0, 1.5, 4],
        target: [0, 0, 0],
        minDistance: 0.8,
        maxDistance: 20,
        minPolarAngle: 0.15,
        maxPolarAngle: Math.PI - 0.15,
        minAzimuthAngle: -Infinity,
        maxAzimuthAngle: Infinity,
        enableDamping: true,
        dampingFactor: 0.1,
        zoomSpeed: 1.1,
        rotateSpeed: 1,
        panSpeed: 0.6,
      },
    },
  },
  {
    id: 'free-explore',
    name: 'Exploración libre',
    description: 'Órbita completa con zoom y desplazamiento.',
    config: {
      interaction: {
        preset: 'explore',
        enableRotate: true,
        enableZoom: true,
        enablePan: true,
        enableHorizontal: true,
        enableVertical: true,
        touchEnabled: true,
        reducedMotion: false,
      },
      autoRotate: {
        enabled: false,
        speed: 1,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 2000,
      },
    },
  },
  {
    id: 'detail-zoom',
    name: 'Detalle con zoom',
    description: 'Zoom cercano, rotación limitada verticalmente.',
    config: {
      interaction: {
        preset: 'limited',
        enableRotate: true,
        enableZoom: true,
        enablePan: true,
        enableHorizontal: true,
        enableVertical: true,
        touchEnabled: true,
        reducedMotion: false,
      },
      camera: {
        type: 'perspective',
        fov: 35,
        position: [0, 1, 2.5],
        target: [0, 0.5, 0],
        minDistance: 0.3,
        maxDistance: 8,
        minPolarAngle: Math.PI * 0.2,
        maxPolarAngle: Math.PI * 0.65,
        minAzimuthAngle: -Infinity,
        maxAzimuthAngle: Infinity,
        enableDamping: true,
        dampingFactor: 0.1,
        zoomSpeed: 1.2,
        rotateSpeed: 0.8,
        panSpeed: 0.6,
      },
    },
  },
  {
    id: 'static-scene',
    name: 'Escena estática',
    description: 'Sin interacción; solo visualización.',
    config: {
      interaction: {
        preset: 'static',
        enableRotate: false,
        enableZoom: false,
        enablePan: false,
        enableHorizontal: false,
        enableVertical: false,
        touchEnabled: false,
        reducedMotion: true,
      },
      autoRotate: {
        enabled: false,
        speed: 0,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 0,
      },
    },
  },
  {
    id: 'mobile-light',
    name: 'Visor móvil ligero',
    description: 'Rotación horizontal, sin pan, DPR limitado.',
    config: {
      interaction: {
        preset: 'horizontal',
        enableRotate: true,
        enableZoom: true,
        enablePan: false,
        enableHorizontal: true,
        enableVertical: false,
        touchEnabled: true,
        reducedMotion: false,
      },
      environment: {
        background: '#1a1a1e',
        exposure: 1,
        showGrid: false,
        showAxes: false,
        maxPixelRatio: 1.5,
      },
      autoRotate: {
        enabled: false,
        speed: 1,
        direction: 1,
        pauseOnInteract: true,
        resumeDelayMs: 2000,
      },
    },
  },
]

/** Presupuestos habituales para piezas 3D embebidas en reportajes web. */
export function createDefaultBudget(): PerformanceBudget {
  return {
    maxFileSizeBytes: 4 * 1024 * 1024,
    maxTriangles: 80_000,
    maxTextureResolution: 2048,
    maxMaterials: 12,
    targetDevice: 'mobile',
  }
}

export function createDefaultExportSettings(): ExportSettings {
  return {
    format: 'glb',
    fileName: 'modelo-optimizado',
    jsMode: 'integrate',
    includeModel: true,
    includeJsModule: true,
    includeReadme: true,
    includeExample: true,
    includeReport: true,
  }
}

export const DEFAULT_PIPELINE: PipelineDefinition = {
  name: 'Pipeline editorial',
  steps: [
    { op: 'dedup' },
    { op: 'weld' },
    { op: 'simplify', params: { ratio: 0.75, error: 0.001 } },
    { op: 'resample' },
    { op: 'prune' },
    { op: 'sparse', params: { ratio: 0.2 } },
    { op: 'reorder' },
    { op: 'meshopt', params: { level: 'medium' } },
  ],
}

export const DEFAULT_PIPELINE_SOURCE = `{
  "name": "Pipeline editorial",
  "steps": [
    { "op": "dedup" },
    { "op": "weld" },
    { "op": "simplify", "params": { "ratio": 0.75, "error": 0.001 } },
    { "op": "resample" },
    { "op": "prune" },
    { "op": "sparse", "params": { "ratio": 0.2 } },
    { "op": "reorder" },
    { "op": "meshopt", "params": { "level": "medium" } }
  ]
}
`

/** Completa ops nuevas si el settings guardado es antiguo. */
export function ensureOptimizationOps(settings: OptimizationSettings): OptimizationSettings {
  const defaults = createDefaultOptimizationSettings()
  const byId = new Map(settings.ops.map((o) => [o.id, o]))
  return {
    ...settings,
    ops: defaults.ops.map((d) => byId.get(d.id) ?? d),
  }
}
