import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ExportSettings,
  OptimizationOpId,
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
  /** Tamaño del working GLB (evita leer el buffer al listar). */
  workingSizeBytes: number
  optimization: OptimizationSettings
  scene: SceneConfig
  exportSettings: ExportSettings
  budget: PerformanceBudget
  appliedOps: OptimizationOpId[]
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

/** Metadatos ligeros para listados (sin ArrayBuffers). */
export interface ProjectListItem {
  id: string
  name: string
  normalizedName: string
  createdAt: number
  modifiedAt: number
  fileName: string
  originalSizeBytes: number
  workingSizeBytes: number
  thumbnailDataUrl: string | null
}

export function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function toListItem(project: StoredProject): ProjectListItem {
  return {
    id: project.id,
    name: project.name,
    normalizedName: normalizeProjectName(project.name),
    createdAt: project.createdAt,
    modifiedAt: project.modifiedAt,
    fileName: project.fileName,
    originalSizeBytes: project.originalSizeBytes,
    workingSizeBytes:
      project.workingSizeBytes ?? project.workingGlb?.byteLength ?? project.originalSizeBytes,
    thumbnailDataUrl: project.thumbnailDataUrl ?? null,
  }
}

interface BuilderDB extends DBSchema {
  projects: {
    key: string
    value: StoredProject
    indexes: { 'by-modified': number }
  }
  projectMeta: {
    key: string
    value: ProjectListItem
    indexes: { 'by-modified': number; 'by-name': string }
  }
}

let dbPromise: Promise<IDBPDatabase<BuilderDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<BuilderDB>('threejs-builder', 2, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('projects', { keyPath: 'id' })
          store.createIndex('by-modified', 'modifiedAt')
        }
        if (oldVersion < 2) {
          const meta = db.createObjectStore('projectMeta', { keyPath: 'id' })
          meta.createIndex('by-modified', 'modifiedAt')
          meta.createIndex('by-name', 'normalizedName')

          // Migrar metadatos desde proyectos existentes (incluye buffers en esta pasada única).
          const projectStore = transaction.objectStore('projects')
          let cursor = await projectStore.openCursor()
          while (cursor) {
            const project = cursor.value as StoredProject
            const workingSizeBytes =
              project.workingSizeBytes ?? project.workingGlb?.byteLength ?? project.originalSizeBytes
            if (project.workingSizeBytes == null) {
              await cursor.update({ ...project, workingSizeBytes })
            }
            await transaction.objectStore('projectMeta').put(
              toListItem({ ...project, workingSizeBytes }),
            )
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('projectMeta', 'by-modified')
  return all.reverse()
}

/** Busca un proyecto por nombre (sin distinguir mayúsculas/espacios). Devuelve metadatos + id. */
export async function findProjectByName(name: string): Promise<ProjectListItem | null> {
  const key = normalizeProjectName(name)
  if (!key) return null
  const db = await getDb()
  const matches = await db.getAllFromIndex('projectMeta', 'by-name', key)
  return matches[0] ?? null
}

export async function saveProject(project: StoredProject): Promise<void> {
  if (project.schemaVersion !== SCHEMA) {
    throw new Error(`Versión de esquema incompatible: ${project.schemaVersion}`)
  }
  const withSize: StoredProject = {
    ...project,
    workingSizeBytes: project.workingGlb.byteLength,
  }
  try {
    const db = await getDb()
    const tx = db.transaction(['projects', 'projectMeta'], 'readwrite')
    await tx.objectStore('projects').put(withSize)
    await tx.objectStore('projectMeta').put(toListItem(withSize))
    await tx.done
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
  const tx = db.transaction(['projects', 'projectMeta'], 'readwrite')
  await tx.objectStore('projects').delete(id)
  await tx.objectStore('projectMeta').delete(id)
  await tx.done
}

export async function duplicateProject(id: string, newName: string): Promise<StoredProject> {
  const src = await loadProject(id)
  const copy: StoredProject = {
    ...src,
    id: crypto.randomUUID(),
    name: newName,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    workingSizeBytes: src.workingGlb.byteLength,
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
