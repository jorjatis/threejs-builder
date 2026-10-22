import JSZip from 'jszip'
import { useAppStore } from '../store/useAppStore'
import { getModelSession, setModelSession } from '../store/modelSession'
import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  findProjectByName,
  type StoredProject,
} from '../storage/projectDb'
import { PROJECT_SCHEMA_VERSION, type SceneConfig } from '../types'
import { readDocumentFromBuffer } from '../model/gltfIo'
import { inspectDocument } from '../model/inspectModel'
import { getViewerService, type ViewerService } from '../viewer/ViewerService'
import { downloadBlob } from '../utils/download'
import { extractTextureInventory } from '../textures/extractTextures'
import {
  mergeActiveAndRemovedTextures,
  restoreRemovedTexturesMap,
  serializeRemovedTextures,
  serializeRemovedTexturesForJson,
  type StoredRemovedTexture,
} from '../textures/removedTexturesPersist'

/** Restaura la escena y el encuadre guardados (sin re-fit que los pise). */
function restoreProjectScene(viewer: ViewerService, scene: SceneConfig): void {
  viewer.applySceneConfig(scene, { moveCamera: true })
  viewer.resize()
  viewer.rememberCamera()
}

export async function saveCurrentProject(): Promise<void> {
  // Volcar encuadre/límites vivos del visor al store antes de serializar
  useAppStore.getState().syncCameraFromViewer()
  getViewerService().rememberCamera()

  const state = useAppStore.getState()
  const session = getModelSession()
  if (!session) {
    state.setError('No hay modelo para guardar.')
    return
  }

  useAppStore.setState({
    saveState: { ...state.saveState, saving: true, error: null },
  })

  try {
    let id = state.projectId
    let createdAt = Date.now()
    let previousThumb: string | null | undefined

    if (id) {
      try {
        const existing = await loadProject(id)
        createdAt = existing.createdAt
        previousThumb = existing.thumbnailDataUrl
      } catch {
        id = null
      }
    }

    // Mismo nombre → actualizar ese proyecto (no duplicar)
    if (!id) {
      const byName = await findProjectByName(state.projectName)
      if (byName) {
        id = byName.id
        createdAt = byName.createdAt
        previousThumb = byName.thumbnailDataUrl
      } else {
        id = crypto.randomUUID()
      }
    }

    const thumb =
      getViewerService().captureThumbnail(160) ?? previousThumb ?? null

    // Releer tras syncCamera (puede haber marcado dirty / actualizado scene)
    const latest = useAppStore.getState()
    const project: StoredProject = {
      id,
      name: latest.projectName.trim() || session.fileName,
      createdAt,
      modifiedAt: Date.now(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
      fileName: session.fileName,
      format: session.format,
      originalGlb: session.originalGlb,
      workingGlb: session.workingGlb,
      originalSizeBytes: session.originalSizeBytes,
      optimization: latest.optimization,
      scene: latest.scene,
      exportSettings: latest.exportSettings,
      budget: latest.budget,
      appliedOps: latest.appliedOps,
      pipelineSource: latest.pipelineSource,
      thumbnailDataUrl: thumb,
      removedTextures: serializeRemovedTextures(session.removedTextures),
      activePresetId: latest.activePresetId,
      activeOptimizationPresetId: latest.activeOptimizationPresetId,
      activeGlobalPresetId: latest.activeGlobalPresetId,
    }
    await saveProject(project)
    useAppStore.setState((s) => ({
      projectId: id,
      projectName: project.name,
      saveState: {
        dirty: false,
        lastSavedAt: Date.now(),
        saving: false,
        error: null,
      },
      projectsRevision: s.projectsRevision + 1,
      toastMessage: `Guardado: ${project.name}`,
    }))
    window.setTimeout(() => {
      const cur = useAppStore.getState().toastMessage
      if (cur?.startsWith('Guardado:')) {
        useAppStore.getState().setToast(null)
      }
    }, 2800)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al guardar'
    useAppStore.setState({
      saveState: { ...useAppStore.getState().saveState, saving: false, error: message },
      errorMessage: message,
    })
  }
}

export async function openProject(id: string): Promise<void> {
  const state = useAppStore.getState()
  state.setError(null)
  useAppStore.setState({
    loadProgress: { active: true, message: 'Abriendo proyecto…', ratio: 0.2 },
  })

  try {
    const project = await loadProject(id)
    const document = await readDocumentFromBuffer(project.workingGlb)
    const removedTextures = restoreRemovedTexturesMap(project.removedTextures)
    setModelSession({
      fileName: project.fileName,
      format: project.format,
      originalGlb: project.originalGlb,
      originalSizeBytes: project.originalSizeBytes,
      workingGlb: project.workingGlb,
      lastValidGlb: project.workingGlb,
      document,
      companionFiles: [],
      removedTextures,
    })

    const viewer = getViewerService()
    await viewer.loadGlb(project.workingGlb, { fitCamera: false })
    restoreProjectScene(viewer, project.scene)
    requestAnimationFrame(() => {
      restoreProjectScene(viewer, project.scene)
    })

    const activeTextures = await extractTextureInventory(document)
    const textures = mergeActiveAndRemovedTextures(activeTextures, removedTextures)

    const originalSize =
      project.originalSizeBytes || project.originalGlb.byteLength || 0
    const originalDoc = await readDocumentFromBuffer(project.originalGlb)
    const originalStats = inspectDocument(originalDoc, {
      fileName: project.fileName,
      fileSizeBytes: originalSize,
      format: project.format,
    })
    const stats = inspectDocument(document, {
      fileName: project.fileName,
      fileSizeBytes: project.workingGlb.byteLength,
      format: project.format,
    })

    useAppStore.setState({
      projectId: project.id,
      projectName: project.name,
      hasModel: true,
      optimization: project.optimization,
      scene: project.scene,
      exportSettings: { ...project.exportSettings, fileName: project.name },
      budget: project.budget,
      appliedOps: project.appliedOps as never,
      pipelineSource: project.pipelineSource,
      textures,
      originalStats,
      stats,
      optimizedSizeBytes: project.workingGlb.byteLength,
      activePresetId: project.activePresetId ?? null,
      activeOptimizationPresetId: project.activeOptimizationPresetId ?? null,
      activeGlobalPresetId: project.activeGlobalPresetId ?? null,
      saveState: { dirty: false, lastSavedAt: project.modifiedAt, saving: false, error: null },
      loadProgress: { active: false, message: '', ratio: null },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo abrir el proyecto'
    useAppStore.setState({
      errorMessage: message,
      loadProgress: { active: false, message: '', ratio: null },
    })
  }
}

export { listProjects, deleteProject }

export async function exportPortableProject(): Promise<void> {
  useAppStore.getState().syncCameraFromViewer()
  getViewerService().rememberCamera()
  const state = useAppStore.getState()
  const session = getModelSession()
  if (!session) {
    state.setError('No hay proyecto para exportar.')
    return
  }

  const zip = new JSZip()
  const meta = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: state.projectName,
    fileName: session.fileName,
    format: session.format,
    originalSizeBytes: session.originalSizeBytes,
    optimization: state.optimization,
    scene: state.scene,
    exportSettings: state.exportSettings,
    budget: state.budget,
    appliedOps: state.appliedOps,
    pipelineSource: state.pipelineSource,
    removedTextures: serializeRemovedTexturesForJson(session.removedTextures),
    activePresetId: state.activePresetId,
    activeOptimizationPresetId: state.activeOptimizationPresetId,
    activeGlobalPresetId: state.activeGlobalPresetId,
    exportedAt: Date.now(),
  }
  zip.file('project.json', JSON.stringify(meta, null, 2))
  zip.file('original.glb', session.originalGlb)
  zip.file('working.glb', session.workingGlb)
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${state.projectName.replace(/\s+/g, '-').toLowerCase()}.tbproj.zip`)
}

export async function importPortableProject(file: File): Promise<void> {
  const zip = await JSZip.loadAsync(file)
  const metaFile = zip.file('project.json')
  const originalFile = zip.file('original.glb')
  const workingFile = zip.file('working.glb')
  if (!metaFile || !originalFile || !workingFile) {
    throw new Error('Archivo de proyecto incompleto (faltan project.json / GLB).')
  }
  const meta = JSON.parse(await metaFile.async('string')) as {
    schemaVersion: number
    name: string
    fileName: string
    format: 'glb' | 'gltf'
    originalSizeBytes: number
    optimization: StoredProject['optimization']
    scene: StoredProject['scene']
    exportSettings: StoredProject['exportSettings']
    budget: StoredProject['budget']
    appliedOps: string[]
    pipelineSource: string
    removedTextures?: StoredRemovedTexture[]
    activePresetId?: string | null
    activeOptimizationPresetId?: string | null
    activeGlobalPresetId?: string | null
  }
  if (meta.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Esquema incompatible: v${meta.schemaVersion}`)
  }
  const originalGlb = await originalFile.async('arraybuffer')
  const workingGlb = await workingFile.async('arraybuffer')
  const document = await readDocumentFromBuffer(workingGlb)
  const removedTextures = restoreRemovedTexturesMap(meta.removedTextures)
  setModelSession({
    fileName: meta.fileName,
    format: meta.format,
    originalGlb,
    originalSizeBytes: meta.originalSizeBytes,
    workingGlb,
    lastValidGlb: workingGlb,
    document,
    companionFiles: [],
    removedTextures,
  })
  const viewer = getViewerService()
  await viewer.loadGlb(workingGlb, { fitCamera: false })
  restoreProjectScene(viewer, meta.scene)
  const activeTextures = await extractTextureInventory(document)
  const textures = mergeActiveAndRemovedTextures(activeTextures, removedTextures)
  const originalSize = meta.originalSizeBytes || originalGlb.byteLength
  const originalDoc = await readDocumentFromBuffer(originalGlb)
  const originalStats = inspectDocument(originalDoc, {
    fileName: meta.fileName,
    fileSizeBytes: originalSize,
    format: meta.format,
  })
  const stats = inspectDocument(document, {
    fileName: meta.fileName,
    fileSizeBytes: workingGlb.byteLength,
    format: meta.format,
  })
  // Si ya hay un proyecto con ese nombre, reutilizar id al guardar
  const existing = await findProjectByName(meta.name)
  useAppStore.setState({
    projectId: existing?.id ?? null,
    projectName: meta.name,
    hasModel: true,
    optimization: meta.optimization,
    scene: meta.scene,
    exportSettings: { ...meta.exportSettings, fileName: meta.name },
    budget: meta.budget,
    appliedOps: meta.appliedOps as never,
    pipelineSource: meta.pipelineSource,
    textures,
    originalStats,
    stats,
    optimizedSizeBytes: workingGlb.byteLength,
    activePresetId: meta.activePresetId ?? null,
    activeOptimizationPresetId: meta.activeOptimizationPresetId ?? null,
    activeGlobalPresetId: meta.activeGlobalPresetId ?? null,
    saveState: { dirty: true, lastSavedAt: null, saving: false, error: null },
  })
}
