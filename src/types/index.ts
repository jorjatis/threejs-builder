/** Tipos compartidos de la aplicación */

export type PanelSection =
  | 'model'
  | 'textures'
  | 'optimization'
  | 'scene'
  | 'editorial'
  | 'performance'
  | 'export'

export type StatConfidence = 'exact' | 'estimated' | 'unavailable'

export interface StatValue<T = number> {
  value: T | null
  confidence: StatConfidence
  label?: string
}

export interface TextureDimensions {
  width: number
  height: number
}

export interface ModelStats {
  fileName: string
  fileSizeBytes: number
  format: 'glb' | 'gltf'
  scenes: StatValue
  nodes: StatValue
  meshes: StatValue
  primitives: StatValue
  vertices: StatValue
  triangles: StatValue
  materials: StatValue
  textures: StatValue
  textureDimensions: TextureDimensions[]
  animations: StatValue
  cameras: StatValue
  lights: StatValue
  extensions: string[]
  drawCalls: StatValue
  geometryMemoryBytes: StatValue
  textureMemoryBytes: StatValue
  compatibilityNotes: string[]
}

export type TextureMapRole =
  | 'baseColor'
  | 'normal'
  | 'metallicRoughness'
  | 'occlusion'
  | 'emissive'
  | 'other'
  | 'unknown'

export interface TextureUsage {
  materialName: string
  materialUuid: string
  slot: string
  role: TextureMapRole
  objectNames: string[]
}

export interface TextureInfo {
  id: string
  name: string
  uuid: string
  width: number
  height: number
  /** Dimensiones en el modelo original (si se conoce). */
  originalWidth?: number
  originalHeight?: number
  format: string
  mimeType: string | null
  /** Tamaño estimado a partir de imagen decodificada (RGBA) o buffer original si se conoce */
  sizeBytes: number
  sizeConfidence: StatConfidence
  roles: TextureMapRole[]
  usages: TextureUsage[]
  active: boolean
  thumbnailDataUrl: string | null
  sourceImageData: ImageData | null
  /**
   * Bytes codificados al eliminar (estado de trabajo: resize/compresión incluidos).
   * Solo en texturas de `removedTextures`.
   */
  encodedImage?: Uint8Array | null
}

export type OptimizationOpId =
  | 'dedup'
  | 'instance'
  | 'palette'
  | 'prune'
  | 'flatten'
  | 'join'
  | 'weld'
  | 'reorder'
  | 'simplify'
  | 'resample'
  | 'sparse'
  | 'textureResize'
  | 'textureCompress'
  | 'meshopt'
  | 'draco'

export interface OptimizationOpConfig {
  id: OptimizationOpId
  enabled: boolean
  available: boolean
  unavailableReason?: string
  lossy: boolean
  params: Record<string, number | string | boolean>
}

export interface OptimizationSettings {
  ops: OptimizationOpConfig[]
  geometryCompression: 'none' | 'meshopt' | 'draco'
  maxTextureSize: number
  simplifyRatio: number
  simplifyError: number
  textureFormat: 'webp' | 'jpeg' | 'png' | 'keep'
}

export interface PipelineStep {
  op: OptimizationOpId
  params?: Record<string, number | string | boolean>
}

export interface PipelineDefinition {
  name: string
  steps: PipelineStep[]
}

export type ConsoleLogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug'

export interface ConsoleEntry {
  id: string
  level: ConsoleLogLevel
  message: string
  timestamp: number
  durationMs?: number
  details?: string
}

export type CameraType = 'perspective' | 'orthographic'

export type InteractionPreset =
  | 'static'
  | 'horizontal'
  | 'free'
  | 'limited'
  | 'explore'

export interface CameraConfig {
  type: CameraType
  fov: number
  position: [number, number, number]
  target: [number, number, number]
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
  minAzimuthAngle: number
  maxAzimuthAngle: number
  enableDamping: boolean
  dampingFactor: number
  zoomSpeed: number
  rotateSpeed: number
  panSpeed: number
  /** Plano cercano de recorte */
  near: number
  /** Plano lejano de recorte */
  far: number
}

export interface InteractionConfig {
  preset: InteractionPreset
  enableRotate: boolean
  enableZoom: boolean
  enablePan: boolean
  enableHorizontal: boolean
  enableVertical: boolean
  touchEnabled: boolean
  reducedMotion: boolean
}

export interface AutoRotateConfig {
  enabled: boolean
  speed: number
  direction: 1 | -1
  pauseOnInteract: boolean
  resumeDelayMs: number
}

export type LightKind = 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot'

/** Valores restablecibles de una luz (sin id/nombre/tipo). */
export interface EditorLightBaseline {
  enabled: boolean
  color: string
  intensity: number
  position?: [number, number, number]
  target?: [number, number, number]
  distance?: number
  angle?: number
  penumbra?: number
  castShadow?: boolean
}

export interface EditorLight {
  id: string
  kind: LightKind
  name: string
  enabled: boolean
  color: string
  intensity: number
  position?: [number, number, number]
  target?: [number, number, number]
  distance?: number
  angle?: number
  penumbra?: number
  castShadow?: boolean
  /** Luces del archivo vs añadidas por el editor */
  source: 'imported' | 'editor'
  /** Snapshot inicial para «volver al ajuste original» */
  baseline?: EditorLightBaseline
}

export interface EnvironmentConfig {
  background: string
  exposure: number
  showGrid: boolean
  showAxes: boolean
  maxPixelRatio: number
}

export type ContainerUnit = 'px' | '%' | 'vh' | 'auto' | 'full'

export interface ContainerConfig {
  widthValue: number
  widthUnit: ContainerUnit
  heightValue: number
  heightUnit: ContainerUnit
  aspectRatio: string | null
  minHeight: number | null
  maxHeight: number | null
  maxWidth: number | null
  background: string
  margin: number
  padding: number
  fullscreenCapable: boolean
  preset: string
}

export interface EditorialConfig {
  title: string
  titleEnabled: boolean
  lead: string
  leadEnabled: boolean
  textAbove: string
  textAboveEnabled: boolean
  textBelow: string
  textBelowEnabled: boolean
  caption: string
  captionEnabled: boolean
  credits: string
  creditsEnabled: boolean
  altText: string
  altTextEnabled: boolean
}

export interface SceneConfig {
  camera: CameraConfig
  interaction: InteractionConfig
  autoRotate: AutoRotateConfig
  lights: EditorLight[]
  environment: EnvironmentConfig
  container: ContainerConfig
  editorial: EditorialConfig
  modelScale: number
  modelPosition: [number, number, number]
  modelRotation: [number, number, number]
}

export interface ScenePreset {
  id: string
  name: string
  description: string
  config: Partial<SceneConfig>
}

export interface PerformanceBudget {
  maxFileSizeBytes: number
  maxTriangles: number
  maxTextureResolution: number
  maxMaterials: number
  targetDevice: 'desktop' | 'mobile'
}

export interface PerformanceAlert {
  id: string
  severity: 'error' | 'warning' | 'info'
  title: string
  message: string
  confirmed: boolean
  suggestedOps?: OptimizationOpId[]
}

export type ExportFormat = 'glb' | 'gltf'
export type JsExportMode = 'integrate' | 'standalone'

export interface ExportSettings {
  format: ExportFormat
  fileName: string
  jsMode: JsExportMode
  includeModel: boolean
  includeJsModule: boolean
  includeReadme: boolean
  includeExample: boolean
  includeReport: boolean
}

export interface HistoryEntry {
  id: string
  label: string
  timestamp: number
  /** Snapshot del documento glTF Transform como ArrayBuffer GLB */
  glbSnapshot: ArrayBuffer
  stats: ModelStats | null
  appliedOps: OptimizationOpId[]
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  modifiedAt: number
  schemaVersion: number
}

export interface SaveState {
  dirty: boolean
  lastSavedAt: number | null
  saving: boolean
  error: string | null
}

export interface LoadProgress {
  active: boolean
  message: string
  ratio: number | null
}

export const PROJECT_SCHEMA_VERSION = 1
