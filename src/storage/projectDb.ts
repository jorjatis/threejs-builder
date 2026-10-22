import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ExportSettings,
  OptimizationSettings,
  SceneConfig,
  PerformanceBudget,
} from '../types'
import { PROJECT_SCHEMA_VERSION as SCHEMA } from '../types'
import type { StoredRemovedTexture } from '../textures/removedTexturesPersist'

export interface StoredProject {
  id: string
  name: string
  createdAt: number
  modifiedAt: number
  schemaVersion: number
  fileName: string
  format: 'glb' | 'gltf'
  originalGlb: ArrayBuffer
  workingGlb: ArrayBuffer
  originalSizeBytes: number
  optimization: OptimizationSettings
  scene: SceneConfig
  exportSettings: ExportSettings
  budget: PerformanceBudget
  appliedOps: string[]
  pipelineSource: string
  /** Miniatura JPEG del visor al guardar (data URL). */
  thumbnailDataUrl?: string | null
  /** Texturas eliminadas recuperables (opcional; proyectos antiguos no lo tienen). */
  removedTextures?: StoredRemovedTexture[]
  /** Preset de escena activo (Escena → Presets). */
  activePresetId?: string | null
  /** Preset de optimización activo (Optimización → Presets). */
  activeOptimizationPresetId?: string | null
  /** Preset global activo (Modelo → Presets globales). */
  activeGlobalPresetId?: string | null
}

export function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

interface BuilderDB extends DBSchema {
  projects: {
    key: string
    value: StoredProject
    indexes: { 'by-modified': number }
  }
}

let dbPromise: Promise<IDBPDatabase<BuilderDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<BuilderDB>('threejs-builder', 1, {
      upgrade(db) {
        const store = db.createObjectStore('projects', { keyPath: 'id' })
        store.createIndex('by-modified', 'modifiedAt')
      },
    })
  }
  return dbPromise
}

export async function listProjects(): Promise<
  Pick<
    StoredProject,
    | 'id'
    | 'name'
    | 'createdAt'
    | 'modifiedAt'
    | 'fileName'
    | 'originalSizeBytes'
    | 'thumbnailDataUrl'
  >[]
> {
  const db = await getDb()
  const all = await db.getAllFromIndex('projects', 'by-modified')
  return all
    .reverse()
    .map(
      ({
        id,
        name,
        createdAt,
        modifiedAt,
        fileName,
        originalSizeBytes,
        workingGlb,
        thumbnailDataUrl,
      }) => ({
        id,
        name,
        createdAt,
        modifiedAt,
        fileName,
        originalSizeBytes: workingGlb?.byteLength ?? originalSizeBytes,
        thumbnailDataUrl: thumbnailDataUrl ?? null,
      }),
    )
}

/** Busca un proyecto por nombre (sin distinguir mayúsculas/espacios). */
export async function findProjectByName(name: string): Promise<StoredProject | null> {
  const key = normalizeProjectName(name)
  if (!key) return null
  const db = await getDb()
  const all = await db.getAll('projects')
  return all.find((p) => normalizeProjectName(p.name) === key) ?? null
}

export async function saveProject(project: StoredProject): Promise<void> {
  if (project.schemaVersion !== SCHEMA) {
    throw new Error(`Versión de esquema incompatible: ${project.schemaVersion}`)
  }
  try {
    const db = await getDb()
    await db.put('projects', project)
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'QuotaExceededError') {
      throw new Error(
        'Cuota de IndexedDB superada. Exporta el proyecto a un archivo ZIP o libera espacio del navegador.',
      )
    }
    throw err
  }
}

export async function loadProject(id: string): Promise<StoredProject> {
  const db = await getDb()
  const project = await db.get('projects', id)
  if (!project) throw new Error('Proyecto no encontrado.')
  if (project.schemaVersion !== SCHEMA) {
    throw new Error(
      `El proyecto usa esquema v${project.schemaVersion}; esta app espera v${SCHEMA}.`,
    )
  }
  return project
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('projects', id)
}

export async function duplicateProject(id: string, newName: string): Promise<StoredProject> {
  const src = await loadProject(id)
  const copy: StoredProject = {
    ...src,
    id: crypto.randomUUID(),
    name: newName,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    originalGlb: src.originalGlb.slice(0),
    workingGlb: src.workingGlb.slice(0),
    removedTextures: src.removedTextures?.map((t) => ({
      ...t,
      encodedImage: t.encodedImage ? t.encodedImage.slice() : null,
      usages: t.usages.map((u) => ({ ...u, objectNames: [...u.objectNames] })),
      roles: [...t.roles],
    })),
  }
  await saveProject(copy)
  return copy
}
