import { create } from 'zustand'
import type {
  PanelSection,
  ModelStats,
  TextureInfo,
  OptimizationSettings,
  SceneConfig,
  ScenePreset,
  PerformanceBudget,
  PerformanceAlert,
  ExportSettings,
  SaveState,
  LoadProgress,
  ConsoleEntry,
  OptimizationOpId,
  ArticlePreviewWidth,
} from '../types'
import {
  createDefaultBudget,
  createDefaultExportSettings,
  createDefaultOptimizationSettings,
  createDefaultSceneConfig,
  ensureOptimizationOps,
  DEFAULT_PIPELINE_SOURCE,
  SCENE_PRESETS,
} from '../scene-config/defaults'
import { createId } from '../utils/id'
import { setModelSession, getModelSession, type ModelSession } from './modelSession'
import { importModelFiles, filterImportableFiles, ImportError } from '../model/importModel'
import { getViewerService } from '../viewer/ViewerService'
import { inspectDocument } from '../model/inspectModel'
import {
  applyThemeToDocument,
  loadUiPrefs,
  saveUiPrefs,
  THEME_VIEWER_BG,
  type UiTheme,
} from '../storage/uiPrefs'

const initialUiPrefs = loadUiPrefs()
applyThemeToDocument(initialUiPrefs.theme)

export interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

let confirmResolver: ((ok: boolean) => void) | null = null

interface AppState {
  activePanel: PanelSection
  projectName: string
  projectId: string | null
  saveState: SaveState
  loadProgress: LoadProgress
  errorMessage: string | null
  toastMessage: string | null
  confirmDialog: ConfirmDialogState | null
  helpOpen: boolean
  hasModel: boolean
  stats: ModelStats | null
  originalStats: ModelStats | null
  optimizedSizeBytes: number | null
  textures: TextureInfo[]
  optimization: OptimizationSettings
  optimizationMode: 'simple' | 'advanced'
  pipelineSource: string
  consoleEntries: ConsoleEntry[]
  isOptimizing: boolean
  cancelOptimization: boolean
  appliedOps: OptimizationOpId[]
  scene: SceneConfig
  scenePresets: ScenePreset[]
  budget: PerformanceBudget
  alerts: PerformanceAlert[]
  exportSettings: ExportSettings
  theme: UiTheme
  sidebarExpanded: boolean
  generatedCode: string | null
  activePresetId: string | null
  activeOptimizationPresetId: string | null
  activeGlobalPresetId: string | null
  showProjectsList: boolean
  projectsRevision: number
  viewerMode: '3d' | 'editorial'
  /** Ancho simulado del mock de artículo (vista editorial). */
  articlePreviewWidth: ArticlePreviewWidth
  optimizationFocusOp: OptimizationOpId | null
  /** Comparar original vs working en el visor. */
  compareSide: 'off' | 'before' | 'after'

  setActivePanel: (panel: PanelSection) => void
  setActivePresetId: (id: string | null) => void
  setActiveOptimizationPresetId: (id: string | null) => void
  setActiveGlobalPresetId: (id: string | null) => void
  setShowProjectsList: (v: boolean) => void
  bumpProjectsRevision: () => void
  setViewerMode: (mode: '3d' | 'editorial') => void
  setArticlePreviewWidth: (w: ArticlePreviewWidth) => void
  setOptimizationFocusOp: (id: OptimizationOpId | null) => void
  setCompareSide: (side: 'off' | 'before' | 'after') => Promise<void>
  setProjectName: (name: string) => void
  setTheme: (theme: UiTheme) => void
  setSidebarExpanded: (v: boolean) => void
  setError: (msg: string | null) => void
  setToast: (msg: string | null) => void
  setHelpOpen: (v: boolean) => void
  askConfirm: (opts: ConfirmDialogState) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
  clearConsole: () => void
  pushConsole: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'> & { timestamp?: number }) => void
  setOptimizationMode: (mode: 'simple' | 'advanced') => void
  setPipelineSource: (src: string) => void
  setOptimization: (partial: Partial<OptimizationSettings>) => void
  toggleOp: (id: OptimizationOpId, enabled: boolean) => void
  setScene: (partial: Partial<SceneConfig> | ((s: SceneConfig) => SceneConfig)) => void
  /** Copia encuadre/límites del visor al store sin reposicionar ni anular el preset. */
  syncCameraFromViewer: () => void
  setBudget: (partial: Partial<PerformanceBudget>) => void
  setExportSettings: (partial: Partial<ExportSettings>) => void
  setTextures: (textures: TextureInfo[]) => void
  setGeneratedCode: (code: string | null) => void
  markDirty: () => void
  setAlerts: (alerts: PerformanceAlert[]) => void

  importFiles: (files: FileList | File[]) => Promise<void>
  reloadViewerFromWorking: () => Promise<void>
  restoreOriginal: () => Promise<void>
  updateStatsFromSession: () => void
  setOptimizedSize: (bytes: number | null) => void
  setIsOptimizing: (v: boolean) => void
  requestCancelOptimization: () => void
  resetCancelFlag: () => void
  getSession: () => ModelSession | null
}

export const useAppStore = create<AppState>((set, get) => ({
  activePanel: 'model',
  projectName: 'Sin título',
  projectId: null,
  saveState: { dirty: false, lastSavedAt: null, saving: false, error: null },
  loadProgress: { active: false, message: '', ratio: null },
  errorMessage: null,
  toastMessage: null,
  confirmDialog: null,
  helpOpen: false,
  hasModel: false,
  stats: null,
  originalStats: null,
  optimizedSizeBytes: null,
  textures: [],
  optimization: createDefaultOptimizationSettings(),
  optimizationMode: 'simple',
  pipelineSource: DEFAULT_PIPELINE_SOURCE,
  consoleEntries: [],
  isOptimizing: false,
  cancelOptimization: false,
  appliedOps: [],
  scene: (() => {
    const scene = createDefaultSceneConfig()
    if (initialUiPrefs.theme === 'light') {
      scene.environment.background = THEME_VIEWER_BG.light
      scene.container.background = '#f4f4f6'
    }
    return scene
  })(),
  scenePresets: SCENE_PRESETS,
  budget: createDefaultBudget(),
  alerts: [],
  exportSettings: createDefaultExportSettings(),
  theme: initialUiPrefs.theme,
  sidebarExpanded: initialUiPrefs.sidebarExpanded,
  generatedCode: null,
  activePresetId: null,
  activeOptimizationPresetId: null,
  activeGlobalPresetId: null,
  showProjectsList: false,
  projectsRevision: 0,
  viewerMode: '3d',
  articlePreviewWidth: '100%',
  optimizationFocusOp: null,
  compareSide: 'off',

  setActivePanel: (panel) => set({ activePanel: panel }),
  setActivePresetId: (id) =>
    set((s) => ({
      activePresetId: id,
      saveState: { ...s.saveState, dirty: true },
    })),
  setActiveOptimizationPresetId: (id) =>
    set((s) => ({
      activeOptimizationPresetId: id,
      saveState: { ...s.saveState, dirty: true },
    })),
  setActiveGlobalPresetId: (id) =>
    set((s) => ({
      activeGlobalPresetId: id,
      saveState: { ...s.saveState, dirty: true },
    })),
  setShowProjectsList: (v) => set({ showProjectsList: v }),
  bumpProjectsRevision: () => set((s) => ({ projectsRevision: s.projectsRevision + 1 })),
  setViewerMode: (mode) => set({ viewerMode: mode }),
  setArticlePreviewWidth: (w) => set({ articlePreviewWidth: w }),
  setOptimizationFocusOp: (id) => set({ optimizationFocusOp: id }),
  setTheme: (theme) => {
    applyThemeToDocument(theme)
    saveUiPrefs({ theme, sidebarExpanded: get().sidebarExpanded })
    const bg = THEME_VIEWER_BG[theme]
    const containerBg = theme === 'light' ? '#f4f4f6' : '#121216'
    set((s) => ({
      theme,
      scene: {
        ...s.scene,
        environment: { ...s.scene.environment, background: bg },
        container: { ...s.scene.container, background: containerBg },
      },
    }))
    getViewerService().applyEnvironment({
      ...get().scene.environment,
      background: bg,
    })
  },
  setSidebarExpanded: (v) => {
    saveUiPrefs({ theme: get().theme, sidebarExpanded: v })
    set({ sidebarExpanded: v })
  },
  setCompareSide: async (side) => {
    const session = getModelSession()
    if (!session) {
      set({ compareSide: 'off' })
      return
    }
    const prev = get().compareSide
    set({ compareSide: side })
    // Comparar solo cambia el buffer del visor; el encuadre no debe moverse.
    if (side === 'off') {
      if (prev === 'off') return
      set({ loadProgress: { active: true, message: 'Actualizando visor…', ratio: 0.5 } })
      try {
        const viewer = getViewerService()
        await viewer.loadGlbPreservingFraming(session.workingGlb)
        viewer.applySceneConfig(get().scene, { moveCamera: false })
      } finally {
        set({ loadProgress: { active: false, message: '', ratio: null } })
      }
      return
    }
    const buffer = side === 'before' ? session.originalGlb : session.workingGlb
    set({ loadProgress: { active: true, message: side === 'before' ? 'Original…' : 'Actual…', ratio: 0.4 } })
    try {
      const viewer = getViewerService()
      await viewer.loadGlbPreservingFraming(buffer)
      viewer.applySceneConfig(get().scene, { moveCamera: false })
    } finally {
      set({ loadProgress: { active: false, message: '', ratio: null } })
    }
  },
  setProjectName: (name) =>
    set((s) => ({
      projectName: name,
      exportSettings: { ...s.exportSettings, fileName: name },
      saveState: { ...s.saveState, dirty: true },
    })),
  setError: (msg) => set({ errorMessage: msg }),
  setToast: (msg) => set({ toastMessage: msg }),
  setHelpOpen: (v) => set({ helpOpen: v }),
  askConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      confirmResolver?.(false)
      confirmResolver = resolve
      set({ confirmDialog: opts })
    }),
  resolveConfirm: (ok) => {
    const resolve = confirmResolver
    confirmResolver = null
    set({ confirmDialog: null })
    resolve?.(ok)
  },
  clearConsole: () => set({ consoleEntries: [] }),
  pushConsole: (entry) =>
    set((s) => ({
      consoleEntries: [
        ...s.consoleEntries,
        {
          id: createId('log'),
          timestamp: entry.timestamp ?? Date.now(),
          level: entry.level,
          message: entry.message,
          durationMs: entry.durationMs,
          details: entry.details,
        },
      ].slice(-500),
    })),
  setOptimizationMode: (mode) => set({ optimizationMode: mode }),
  setPipelineSource: (src) => set({ pipelineSource: src }),
  setOptimization: (partial) =>
    set((s) => ({
      optimization: ensureOptimizationOps({ ...s.optimization, ...partial }),
      saveState: { ...s.saveState, dirty: true },
      // Cambio manual: ya no coincide con un preset concreto
      activeOptimizationPresetId: null,
    })),
  toggleOp: (id, enabled) =>
    set((s) => {
      const base = ensureOptimizationOps(s.optimization)
      return {
        activeOptimizationPresetId: null,
        optimization: {
          ...base,
          ops: base.ops.map((op) => (op.id === id ? { ...op, enabled } : op)),
          geometryCompression:
            id === 'meshopt' && enabled
              ? 'meshopt'
              : id === 'draco' && enabled
                ? 'draco'
                : (id === 'meshopt' || id === 'draco') && !enabled
                  ? 'none'
                  : base.geometryCompression,
        },
        saveState: { ...s.saveState, dirty: true },
      }
    }),
  setScene: (partial) =>
    set((s) => {
      const patch = typeof partial === 'function' ? partial(s.scene) : partial
      const next = {
        ...s.scene,
        ...patch,
        camera: patch.camera ? { ...s.scene.camera, ...patch.camera } : s.scene.camera,
        interaction: patch.interaction
          ? { ...s.scene.interaction, ...patch.interaction }
          : s.scene.interaction,
        autoRotate: patch.autoRotate
          ? { ...s.scene.autoRotate, ...patch.autoRotate }
          : s.scene.autoRotate,
        environment: patch.environment
          ? { ...s.scene.environment, ...patch.environment }
          : s.scene.environment,
        container: patch.container
          ? { ...s.scene.container, ...patch.container }
          : s.scene.container,
        editorial: patch.editorial
          ? { ...s.scene.editorial, ...patch.editorial }
          : s.scene.editorial,
        lights: patch.lights ?? s.scene.lights,
      }
      const changed = Object.keys(patch) as (keyof typeof next)[]
      // Solo reposicionar si position/target cambian de verdad (no al tocar near/far/speeds).
      if (changed.includes('camera')) {
        const prevCam = s.scene.camera
        const camPatch = patch.camera
        const sameVec = (
          a?: [number, number, number],
          b?: [number, number, number],
        ) =>
          !!a &&
          !!b &&
          a[0] === b[0] &&
          a[1] === b[1] &&
          a[2] === b[2]
        const moveCamera = !!(
          camPatch &&
          ((camPatch.position != null && !sameVec(camPatch.position, prevCam.position)) ||
            (camPatch.target != null && !sameVec(camPatch.target, prevCam.target)))
        )
        getViewerService().applyCameraConfig(next.camera, { moveCamera })
      }
      if (changed.includes('environment')) getViewerService().applyEnvironment(next.environment)
      if (changed.includes('interaction')) {
        getViewerService().applyInteraction(next.interaction)
        getViewerService().applyAutoRotate(next.autoRotate, next.interaction.reducedMotion)
      }
      if (changed.includes('autoRotate')) {
        getViewerService().applyAutoRotate(next.autoRotate, next.interaction.reducedMotion)
      }
      if (changed.includes('lights')) getViewerService().syncEditorLights(next.lights)
      if (
        changed.includes('modelScale') ||
        changed.includes('modelPosition') ||
        changed.includes('modelRotation')
      ) {
        getViewerService().applyModelTransform(
          next.modelScale,
          next.modelPosition,
          next.modelRotation,
        )
      }
      const clearsPreset = changed.some((k) =>
        ['camera', 'interaction', 'autoRotate', 'lights', 'environment', 'container'].includes(k),
      )
      return {
        scene: next,
        saveState: { ...s.saveState, dirty: true },
        activePresetId: clearsPreset ? null : s.activePresetId,
        activeGlobalPresetId: clearsPreset ? null : s.activeGlobalPresetId,
      }
    }),
  syncCameraFromViewer: () => {
    const live = getViewerService().captureLiveCameraPatch()
    const s = get()
    const cam = s.scene.camera
    const r = (n: number) => Math.round(n * 1000) / 1000
    const pos: [number, number, number] = [
      r(live.position[0]),
      r(live.position[1]),
      r(live.position[2]),
    ]
    const target: [number, number, number] = [
      r(live.target[0]),
      r(live.target[1]),
      r(live.target[2]),
    ]
    const minDistance = Math.max(0.01, r(live.minDistance))
    const maxDistance = Math.max(minDistance, r(live.maxDistance))
    const fov = live.fov != null ? r(live.fov) : null
    const samePos =
      r(cam.position[0]) === pos[0] &&
      r(cam.position[1]) === pos[1] &&
      r(cam.position[2]) === pos[2]
    const sameTarget =
      r(cam.target[0]) === target[0] &&
      r(cam.target[1]) === target[1] &&
      r(cam.target[2]) === target[2]
    const sameFov = fov == null || r(cam.fov) === fov
    if (
      samePos &&
      sameTarget &&
      sameFov &&
      r(cam.minDistance) === minDistance &&
      r(cam.maxDistance) === maxDistance
    ) {
      return
    }
    set({
      scene: {
        ...s.scene,
        camera: {
          ...cam,
          position: pos,
          target,
          minDistance,
          maxDistance,
          ...(fov != null ? { fov } : {}),
        },
      },
      saveState: { ...s.saveState, dirty: true },
    })
  },
  setBudget: (partial) => set((s) => ({ budget: { ...s.budget, ...partial } })),
  setExportSettings: (partial) =>
    set((s) => ({
      exportSettings: { ...s.exportSettings, ...partial },
      ...(partial.fileName != null ? { projectName: partial.fileName } : {}),
      saveState: { ...s.saveState, dirty: true },
    })),
  setTextures: (textures) => set({ textures }),
  setGeneratedCode: (code) => set({ generatedCode: code }),
  markDirty: () => set((s) => ({ saveState: { ...s.saveState, dirty: true } })),
  setAlerts: (alerts) => set({ alerts }),
  setOptimizedSize: (bytes) => set({ optimizedSizeBytes: bytes }),
  setIsOptimizing: (v) => set({ isOptimizing: v }),
  requestCancelOptimization: () => set({ cancelOptimization: true }),
  resetCancelFlag: () => set({ cancelOptimization: false }),
  getSession: () => getModelSession(),

  updateStatsFromSession: () => {
    const session = getModelSession()
    if (!session?.document) return
    const stats = inspectDocument(session.document, {
      fileName: session.fileName,
      fileSizeBytes: session.workingGlb.byteLength,
      format: session.format,
    })
    set({ stats, optimizedSizeBytes: session.workingGlb.byteLength })
  },

  importFiles: async (files) => {
    const filtered = filterImportableFiles(files)
    if (filtered.length === 0) {
      set({ errorMessage: 'No se encontraron archivos .glb o .gltf válidos.' })
      return
    }

    set({
      loadProgress: { active: true, message: 'Importando modelo…', ratio: 0.1 },
      errorMessage: null,
    })

    try {
      const imported = await importModelFiles(filtered)
      const session: ModelSession = {
        fileName: imported.fileName,
        format: imported.format,
        originalGlb: imported.originalGlb,
        originalSizeBytes: imported.originalSizeBytes,
        workingGlb: imported.workingGlb,
        lastValidGlb: imported.workingGlb,
        document: imported.document,
        companionFiles: imported.companionFiles,
        removedTextures: new Map(),
      }
      setModelSession(session)

      const { extractPunctualLights, mergeImportedLights } = await import('../model/extractLights')
      const extractedLights = extractPunctualLights(imported.document)
      const nextLights = mergeImportedLights(get().scene.lights, extractedLights)
      const nextScene = { ...get().scene, lights: nextLights }

      const viewer = getViewerService()
      set({ loadProgress: { active: true, message: 'Cargando en el visor…', ratio: 0.6 } })
      await viewer.loadGlb(imported.workingGlb)
      // No mover la cámara a la posición por defecto de escena: el fit ya encuadró el modelo
      viewer.applySceneConfig(nextScene, { moveCamera: false })
      viewer.fitCameraToModel()
      viewer.rememberCamera()

      const baseName = imported.fileName.replace(/\.(glb|gltf)$/i, '')
      // Si ya existe un proyecto con ese nombre, al guardar se actualizará (no duplicar)
      const { findProjectByName } = await import('../storage/projectDb')
      const existing = await findProjectByName(baseName)
      const name = existing?.name ?? baseName
      set({
        projectId: existing?.id ?? null,
        hasModel: true,
        stats: imported.stats,
        originalStats: imported.stats,
        optimizedSizeBytes: imported.workingGlb.byteLength,
        projectName: name,
        scene: nextScene,
        exportSettings: {
          ...get().exportSettings,
          fileName: name,
        },
        loadProgress: { active: false, message: '', ratio: null },
        compareSide: 'off',
        saveState: {
          dirty: true,
          lastSavedAt: existing?.modifiedAt ?? null,
          saving: false,
          error: null,
        },
        appliedOps: [],
        activePanel: 'model',
        textures: [],
        activePresetId: null,
        activeOptimizationPresetId: null,
        activeGlobalPresetId: null,
      })

      if (extractedLights.length > 0) {
        get().setToast(
          `Importadas ${extractedLights.length} luz(ces) del modelo. Puedes ajustarlas en Escena.`,
        )
        window.setTimeout(() => {
          if (get().toastMessage?.startsWith('Importadas')) {
            get().setToast(null)
          }
        }, 4000)
      }

    } catch (err) {
      const message =
        err instanceof ImportError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Error al importar el modelo.'
      set({
        errorMessage: message,
        loadProgress: { active: false, message: '', ratio: null },
      })
      console.error(err)
    }
  },

  reloadViewerFromWorking: async () => {
    const session = getModelSession()
    if (!session) return
    // Volcar vista actual al store antes de recargar (texturas / opt / comparar…)
    get().syncCameraFromViewer()
    set({
      loadProgress: { active: true, message: 'Actualizando visor…', ratio: 0.5 },
      compareSide: 'off',
    })
    try {
      const { readDocumentFromBuffer } = await import('../model/gltfIo')
      session.document = await readDocumentFromBuffer(session.workingGlb)
      const viewer = getViewerService()
      await viewer.loadGlbPreservingFraming(session.workingGlb)
      // Luces/env/límites desde store; no mover la cámara (ya restaurada)
      viewer.applySceneConfig(get().scene, { moveCamera: false })
      get().updateStatsFromSession()
      const { extractTextureInventory } = await import('../textures/extractTextures')
      const { mergeActiveAndRemovedTextures } = await import(
        '../textures/removedTexturesPersist'
      )
      const list = await extractTextureInventory(session.document)
      set({ textures: mergeActiveAndRemovedTextures(list, session.removedTextures) })
    } finally {
      set({ loadProgress: { active: false, message: '', ratio: null } })
    }
  },

  restoreOriginal: async () => {
    const session = getModelSession()
    if (!session) return
    session.workingGlb = session.originalGlb.slice(0)
    session.lastValidGlb = session.workingGlb
    const { readDocumentFromBuffer } = await import('../model/gltfIo')
    session.document = await readDocumentFromBuffer(session.workingGlb)
    set({
      appliedOps: [],
      optimization: createDefaultOptimizationSettings(),
      stats: get().originalStats,
      optimizedSizeBytes: session.originalSizeBytes,
      compareSide: 'off',
      saveState: { ...get().saveState, dirty: true },
    })
    await get().reloadViewerFromWorking()
  },
}))
