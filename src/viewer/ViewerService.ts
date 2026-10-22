import {
  AmbientLight,
  AxesHelper,
  BufferGeometry,
  Color,
  DirectionalLight,
  DirectionalLightHelper,
  Float32BufferAttribute,
  GridHelper,
  Group,
  HemisphereLight,
  HemisphereLightHelper,
  PerspectiveCamera,
  OrthographicCamera,
  PointLight,
  PointLightHelper,
  Points,
  PointsMaterial,
  Scene,
  SpotLight,
  SpotLightHelper,
  WebGLRenderer,
  Box3,
  Vector3,
  MathUtils,
  Mesh,
  type Camera,
  type Light,
  type Material,
  type Object3D,
  type AnimationMixer,
  AnimationMixer as ThreeAnimationMixer,
  Clock,
} from 'three'

type LightHelper = DirectionalLightHelper | PointLightHelper | SpotLightHelper | HemisphereLightHelper
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { disposeObject3D } from '../utils/dispose'
import { parseColorAlpha } from '../utils/colorAlpha'
import type {
  AutoRotateConfig,
  CameraConfig,
  EditorLight,
  EnvironmentConfig,
  InteractionConfig,
  SceneConfig,
} from '../types'
import { measureSceneDrawCalls } from '../model/inspectModel'

export interface LiveCameraPatch {
  position: [number, number, number]
  target: [number, number, number]
  minDistance: number
  maxDistance: number
  fov?: number
}

export interface ViewerCallbacks {
  onLoadProgress?: (ratio: number, message: string) => void
  onLoadError?: (message: string) => void
  onContextLost?: () => void
  onStatsMeasured?: (data: {
    drawCalls: number
    vertices: number
    triangles: number
  }) => void
  /** Encuadre real del visor (órbita, fit, vistas). */
  onCameraChange?: (cam: LiveCameraPatch) => void
}

/**
 * Ciclo de vida Three.js fuera de React.
 * Un único requestAnimationFrame por instancia.
 */
export class ViewerService {
  readonly scene = new Scene()
  readonly modelRoot = new Group()
  readonly editorLightsRoot = new Group()
  readonly helpersRoot = new Group()

  private renderer: WebGLRenderer | null = null
  private camera: PerspectiveCamera | OrthographicCamera
  private controls: OrbitControls | null = null
  private container: HTMLElement | null = null
  private raf = 0
  private running = false
  private clock = new Clock()
  private mixer: AnimationMixer | null = null
  private grid: GridHelper | null = null
  private axes: AxesHelper | null = null
  private verticesPoints: Points | null = null
  private editorLights = new Map<string, Light>()
  private resizeObserver: ResizeObserver | null = null
  private callbacks: ViewerCallbacks = {}
  private maxPixelRatio = 2
  private autoRotate: AutoRotateConfig = {
    enabled: false,
    speed: 1,
    direction: 1,
    pauseOnInteract: true,
    resumeDelayMs: 2000,
  }
  private resumeTimer: ReturnType<typeof setTimeout> | null = null
  private userInteracting = false
  private gltfLoader: GLTFLoader
  private currentObjectUrl: string | null = null
  private perspectiveCamera: PerspectiveCamera
  private orthographicCamera: OrthographicCamera
  private savedCamera: {
    position: [number, number, number]
    target: [number, number, number]
    minDistance: number
    maxDistance: number
    fov: number | null
  } | null = null
  private wireframe = false
  private showVertices = false
  private showLightHelpers = false
  private lightHelpers = new Map<string, LightHelper>()
  private lastCameraLimits: Pick<
    CameraConfig,
    'minPolarAngle' | 'maxPolarAngle' | 'minAzimuthAngle' | 'maxAzimuthAngle' | 'minDistance' | 'maxDistance'
  > | null = null
  /** Última inercia de cámara (para restaurarla al quitar movimiento reducido). */
  private lastEnableDamping = true

  constructor() {
    this.perspectiveCamera = new PerspectiveCamera(45, 1, 0.01, 2000)
    this.perspectiveCamera.position.set(0, 1.5, 4)
    this.orthographicCamera = new OrthographicCamera(-2, 2, 2, -2, 0.01, 2000)
    this.orthographicCamera.position.set(0, 1.5, 4)
    this.camera = this.perspectiveCamera

    this.scene.add(this.modelRoot)
    this.scene.add(this.editorLightsRoot)
    this.scene.add(this.helpersRoot)
    this.scene.background = new Color('#1a1a1e')

    const draco = new DRACOLoader()
    draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(draco)
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder)
  }

  setCallbacks(cb: ViewerCallbacks): void {
    this.callbacks = cb
  }

  mount(container: HTMLElement): void {
    if (this.container === container && this.renderer) return
    this.unmount()
    this.container = container

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.toneMappingExposure = 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio))
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false)

    const controls = new OrbitControls(this.camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true
    controls.addEventListener('start', this.onControlsStart)
    controls.addEventListener('end', this.onControlsEnd)
    this.controls = controls

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.start()
  }

  unmount(): void {
    this.stop()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.controls) {
      this.controls.removeEventListener('start', this.onControlsStart)
      this.controls.removeEventListener('end', this.onControlsEnd)
      this.controls.dispose()
      this.controls = null
    }
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
      this.renderer.dispose()
      this.renderer.domElement.remove()
      this.renderer = null
    }
    this.container = null
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.callbacks.onContextLost?.()
  }

  private onControlsStart = () => {
    this.userInteracting = true
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer)
      this.resumeTimer = null
    }
  }

  private onControlsEnd = () => {
    this.userInteracting = false
    if (this.autoRotate.enabled && this.autoRotate.pauseOnInteract) {
      if (this.resumeTimer) clearTimeout(this.resumeTimer)
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null
      }, this.autoRotate.resumeDelayMs)
    }
    this.emitCameraChange()
  }

  private emitCameraChange(): void {
    this.callbacks.onCameraChange?.(this.captureLiveCameraPatch())
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.clock.start()
    const tick = () => {
      if (!this.running) return
      this.raf = requestAnimationFrame(tick)
      const dt = this.clock.getDelta()
      this.mixer?.update(dt)

      if (this.controls) {
        const rotating =
          this.autoRotate.enabled &&
          !(this.autoRotate.pauseOnInteract && this.userInteracting) &&
          !this.resumeTimer
        this.controls.autoRotate = rotating
        this.controls.autoRotateSpeed = this.autoRotate.speed * this.autoRotate.direction * 2
        this.controls.update()
      }

      if (this.showLightHelpers) {
        for (const helper of this.lightHelpers.values()) {
          helper.update()
        }
      }

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera)
      }
    }
    tick()
  }

  stop(): void {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  resize(): void {
    if (!this.container || !this.renderer) return
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio))

    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    } else {
      const frustum = 2
      const aspect = w / h
      this.camera.left = -frustum * aspect
      this.camera.right = frustum * aspect
      this.camera.top = frustum
      this.camera.bottom = -frustum
      this.camera.updateProjectionMatrix()
    }
  }

  async loadGlb(
    buffer: ArrayBuffer,
    opts?: { fitCamera?: boolean },
  ): Promise<Object3D> {
    const fitCamera = opts?.fitCamera !== false
    this.callbacks.onLoadProgress?.(0, 'Cargando modelo…')
    this.clearModel()

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }

    const blob = new Blob([buffer], { type: 'model/gltf-binary' })
    const url = URL.createObjectURL(blob)
    this.currentObjectUrl = url

    const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>(
      (resolve, reject) => {
        this.gltfLoader.load(
          url,
          resolve,
          (ev) => {
            if (ev.total) {
              this.callbacks.onLoadProgress?.(ev.loaded / ev.total, 'Cargando modelo…')
            }
          },
          (err) => reject(err),
        )
      },
    )

    const root = gltf.scene
    // Las luces KHR se controlan desde el panel Escena; evita iluminar dos veces.
    this.stripEmbeddedLights(root)
    this.modelRoot.add(root)

    if (gltf.animations.length > 0) {
      this.mixer = new ThreeAnimationMixer(root)
      for (const clip of gltf.animations) {
        this.mixer.clipAction(clip).play()
      }
    }

    this.modelRoot.updateMatrixWorld(true)
    this.resize()
    if (fitCamera) {
      this.fitCameraToModel()
      this.rememberCamera()
      // Segundo pase tras layout (canvas a veces aún a 0×0 en el primer frame)
      requestAnimationFrame(() => {
        this.resize()
        this.fitCameraToModel()
        this.rememberCamera()
      })
    }
    if (this.wireframe) this.applyWireframe(true)
    if (this.showVertices) this.rebuildVerticesOverlay()

    const measured = measureSceneDrawCalls(root)
    this.callbacks.onStatsMeasured?.(measured)
    this.callbacks.onLoadProgress?.(1, 'Listo')
    return root
  }

  clearModel(): void {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer = null
    }
    this.clearVerticesOverlay()
    while (this.modelRoot.children.length > 0) {
      const child = this.modelRoot.children[0]
      this.modelRoot.remove(child)
      disposeObject3D(child)
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }
  }

  /**
   * Encuadra el modelo llenando ~65% del visor (FOV + bounding box).
   * Por defecto conserva min/max del usuario (solo amplía max si hace falta).
   * `resetLimits: true` aplica los límites por defecto de Escena (0.5 / 3).
   */
  fitCameraToModel(opts?: {
    silent?: boolean
    resetLimits?: boolean
    /** Encuadre tipo artículo: más frontal, elevado, con aire alrededor. */
    style?: 'default' | 'editorial'
  }): void {
    if (!this.controls) return
    this.modelRoot.updateMatrixWorld(true)
    const box = new Box3().setFromObject(this.modelRoot)
    if (box.isEmpty()) return

    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const editorial = opts?.style === 'editorial'

    let distance: number
    if (this.camera instanceof PerspectiveCamera) {
      const fov = MathUtils.degToRad(this.camera.fov)
      const el = this.renderer?.domElement
      const aspect =
        el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : this.camera.aspect || 1
      // Distancia para que el AABB quepa en alto y en ancho
      const fitH = maxDim / 2 / Math.tan(fov / 2)
      const fitW = maxDim / 2 / Math.tan(fov / 2) / Math.max(aspect, 0.01)
      distance = Math.max(fitH, fitW) * (editorial ? 1.65 : 1.45)
    } else {
      distance = maxDim * (editorial ? 2.5 : 2.2)
    }

    // Vista ¾: editorial más frontal y elevada (como embebidos de museo / reportaje)
    const dir = editorial
      ? new Vector3(0.32, 0.48, 1).normalize()
      : new Vector3(0.55, 0.38, 1).normalize()
    this.camera.position.copy(center).addScaledVector(dir, distance)
    this.controls.target.copy(center)

    let minDistance: number
    let maxDistance: number
    if (opts?.resetLimits) {
      minDistance = 0.5
      maxDistance = Math.max(3, minDistance)
    } else {
      minDistance = Math.max(
        0.01,
        this.lastCameraLimits?.minDistance ?? this.controls.minDistance ?? 0.5,
      )
      maxDistance = Math.max(
        minDistance,
        this.lastCameraLimits?.maxDistance ?? this.controls.maxDistance ?? 3,
        distance * 1.05,
      )
    }
    this.controls.minDistance = minDistance
    this.controls.maxDistance = maxDistance
    this.controls.update()

    if (this.lastCameraLimits) {
      this.lastCameraLimits = {
        ...this.lastCameraLimits,
        minDistance,
        maxDistance,
      }
    } else {
      this.lastCameraLimits = {
        minPolarAngle: this.controls.minPolarAngle,
        maxPolarAngle: this.controls.maxPolarAngle,
        minAzimuthAngle: this.controls.minAzimuthAngle,
        maxAzimuthAngle: this.controls.maxAzimuthAngle,
        minDistance,
        maxDistance,
      }
    }

    // near/far los marca la config de escena; el fit no los pisa.
    this.syncHelperScale(maxDim)
    if (!opts?.silent) this.emitCameraChange()
  }

  rememberCamera(): void {
    const { position, target } = this.captureCameraState()
    const minDistance = Math.max(
      0.01,
      this.lastCameraLimits?.minDistance ?? this.controls?.minDistance ?? 0.5,
    )
    const maxDistance = Math.max(
      minDistance,
      this.lastCameraLimits?.maxDistance ?? this.controls?.maxDistance ?? 3,
    )
    this.savedCamera = {
      position,
      target,
      minDistance,
      maxDistance,
      fov: this.camera instanceof PerspectiveCamera ? this.camera.fov : null,
    }
  }

  /** Aplica posición/target/límites/FOV sin tocar el bookmark de «Guardar encuadre». */
  applyLiveCameraPatch(patch: LiveCameraPatch, opts?: { silent?: boolean }): void {
    if (!this.controls) return
    const minDistance = Math.max(0.01, patch.minDistance)
    const maxDistance = Math.max(minDistance, patch.maxDistance)
    this.camera.position.set(...patch.position)
    this.controls.target.set(...patch.target)
    this.controls.minDistance = minDistance
    this.controls.maxDistance = maxDistance
    if (this.lastCameraLimits) {
      this.lastCameraLimits = {
        ...this.lastCameraLimits,
        minDistance,
        maxDistance,
      }
    }
    if (patch.fov != null && this.camera instanceof PerspectiveCamera) {
      this.camera.fov = patch.fov
      this.camera.updateProjectionMatrix()
    }
    this.controls.update()
    if (!opts?.silent) this.emitCameraChange()
  }

  /**
   * Recarga un GLB manteniendo la vista actual y el encuadre bookmark
   * (texturas, optimización, comparar, etc.).
   */
  async loadGlbPreservingFraming(buffer: ArrayBuffer): Promise<Object3D> {
    const live = this.captureLiveCameraPatch()
    const bookmark = this.savedCamera
      ? {
          position: [...this.savedCamera.position] as [number, number, number],
          target: [...this.savedCamera.target] as [number, number, number],
          minDistance: this.savedCamera.minDistance,
          maxDistance: this.savedCamera.maxDistance,
          fov: this.savedCamera.fov,
        }
      : null
    const root = await this.loadGlb(buffer, { fitCamera: false })
    this.applyLiveCameraPatch(live, { silent: true })
    this.savedCamera = bookmark
    return root
  }

  /** Vuelve al encuadre guardado (posición, límites y FOV) o al último fit si no hay guardado. */
  resetCamera(): void {
    if (!this.controls) return
    if (this.savedCamera) {
      this.applyLiveCameraPatch({
        position: this.savedCamera.position,
        target: this.savedCamera.target,
        minDistance: this.savedCamera.minDistance,
        maxDistance: this.savedCamera.maxDistance,
        ...(this.savedCamera.fov != null ? { fov: this.savedCamera.fov } : {}),
      })
      return
    }
    this.fitCameraToModel()
  }

  setView(view: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right'): void {
    if (!this.controls) return
    this.modelRoot.updateMatrixWorld(true)
    const box = new Box3().setFromObject(this.modelRoot)
    const center = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3())
    const size = box.isEmpty() ? new Vector3(1, 1, 1) : box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    let dist = maxDim * 2.2
    if (this.camera instanceof PerspectiveCamera) {
      const fov = MathUtils.degToRad(this.camera.fov)
      const el = this.renderer?.domElement
      const aspect =
        el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : this.camera.aspect || 1
      const fitH = maxDim / 2 / Math.tan(fov / 2)
      const fitW = maxDim / 2 / Math.tan(fov / 2) / Math.max(aspect, 0.01)
      dist = Math.max(fitH, fitW) * 1.45
    }

    const offsets: Record<string, Vector3> = {
      front: new Vector3(0, 0, dist),
      back: new Vector3(0, 0, -dist),
      top: new Vector3(0, dist, 0.001),
      bottom: new Vector3(0, -dist, 0.001),
      left: new Vector3(-dist, 0, 0),
      right: new Vector3(dist, 0, 0),
    }
    this.camera.position.copy(center.clone().add(offsets[view]))
    this.controls.target.copy(center)
    this.controls.update()
    this.emitCameraChange()
  }

  /** Solo fondo / exposición / DPR — no toca la cámara. */
  applyEnvironment(env: EnvironmentConfig): void {
    const { hex, alpha } = parseColorAlpha(env.background || '#111111')
    const color = new Color(hex)
    this.maxPixelRatio = env.maxPixelRatio
    // ≥99% → fondo opaco de escena (fiable). Por debajo → clearColor con alpha.
    if (alpha >= 0.99) {
      this.scene.background = color
      if (this.renderer) {
        this.renderer.setClearColor(color, 1)
        this.renderer.setClearAlpha(1)
        this.renderer.domElement.style.backgroundColor = hex
      }
    } else {
      this.scene.background = null
      if (this.renderer) {
        this.renderer.setClearColor(color, alpha)
        this.renderer.setClearAlpha(alpha)
        this.renderer.domElement.style.backgroundColor = 'transparent'
      }
    }
    if (this.renderer) {
      this.renderer.toneMappingExposure = env.exposure
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio))
    }
    this.setGrid(env.showGrid)
    this.setAxes(env.showAxes)
  }

  private syncHelperScale(maxDim: number): void {
    const size = Math.max(maxDim * 2, 2)
    if (this.grid) {
      this.grid.scale.setScalar(size / 10)
    }
    if (this.axes) {
      this.axes.scale.setScalar(size / 4)
    }
  }

  setGrid(show: boolean): void {
    if (show && !this.grid) {
      this.grid = new GridHelper(10, 20, 0x555555, 0x333338)
      // Evita z-fighting con ejes: ligeramente por debajo del plano Y=0
      this.grid.position.y = -0.001
      const mats = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]
      for (const m of mats) {
        m.depthWrite = false
        m.transparent = true
        m.opacity = 0.85
      }
      this.helpersRoot.add(this.grid)
      const box = new Box3().setFromObject(this.modelRoot)
      if (!box.isEmpty()) {
        const size = box.getSize(new Vector3())
        this.syncHelperScale(Math.max(size.x, size.y, size.z))
      }
    } else if (!show && this.grid) {
      this.helpersRoot.remove(this.grid)
      this.grid.dispose()
      this.grid = null
    }
  }

  setAxes(show: boolean): void {
    if (show && !this.axes) {
      this.axes = new AxesHelper(2)
      // Ligeramente por encima de la cuadrícula
      this.axes.position.y = 0.002
      const mat = this.axes.material as Material
      mat.depthTest = true
      mat.depthWrite = false
      this.helpersRoot.add(this.axes)
      const box = new Box3().setFromObject(this.modelRoot)
      if (!box.isEmpty()) {
        const size = box.getSize(new Vector3())
        this.syncHelperScale(Math.max(size.x, size.y, size.z))
      }
    } else if (!show && this.axes) {
      this.helpersRoot.remove(this.axes)
      this.axes.dispose()
      this.axes = null
    }
  }

  setWireframe(enabled: boolean): void {
    this.wireframe = enabled
    this.applyWireframe(enabled)
  }

  isWireframe(): boolean {
    return this.wireframe
  }

  private applyWireframe(enabled: boolean): void {
    this.modelRoot.traverse((obj) => {
      if (obj instanceof Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const m of mats) {
          if (m && 'wireframe' in m) {
            ;(m as Material & { wireframe: boolean }).wireframe = enabled
          }
        }
      }
    })
  }

  setShowVertices(enabled: boolean): void {
    this.showVertices = enabled
    if (enabled) this.rebuildVerticesOverlay()
    else this.clearVerticesOverlay()
  }

  isShowVertices(): boolean {
    return this.showVertices
  }

  private clearVerticesOverlay(): void {
    if (!this.verticesPoints) return
    this.helpersRoot.remove(this.verticesPoints)
    this.verticesPoints.geometry.dispose()
    ;(this.verticesPoints.material as PointsMaterial).dispose()
    this.verticesPoints = null
  }

  private rebuildVerticesOverlay(): void {
    this.clearVerticesOverlay()
    const positions: number[] = []
    this.modelRoot.updateMatrixWorld(true)
    this.modelRoot.traverse((obj) => {
      if (!(obj instanceof Mesh) || !obj.geometry) return
      const pos = obj.geometry.getAttribute('position')
      if (!pos) return
      const v = new Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld)
        positions.push(v.x, v.y, v.z)
      }
    })
    if (positions.length === 0) return
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const mat = new PointsMaterial({
      color: 0x5b9fd4,
      size: 2,
      sizeAttenuation: false,
      depthTest: true,
    })
    this.verticesPoints = new Points(geo, mat)
    this.verticesPoints.frustumCulled = false
    this.helpersRoot.add(this.verticesPoints)
  }

  applyCameraConfig(cfg: CameraConfig, opts?: { moveCamera?: boolean }): void {
    // Por defecto no reposiciona: cambiar FOV/límites/damping no debe romper el encuadre.
    const moveCamera = opts?.moveCamera === true
    const prev = this.camera
    const near = Math.max(0.001, cfg.near ?? 0.1)
    const far = Math.max(near + 0.1, cfg.far ?? 2000)

    if (cfg.type === 'perspective') {
      this.perspectiveCamera.fov = cfg.fov
      this.perspectiveCamera.near = near
      this.perspectiveCamera.far = far
      if (moveCamera) this.perspectiveCamera.position.set(...cfg.position)
      this.perspectiveCamera.updateProjectionMatrix()
      this.camera = this.perspectiveCamera
    } else {
      this.orthographicCamera.near = near
      this.orthographicCamera.far = far
      if (moveCamera) this.orthographicCamera.position.set(...cfg.position)
      this.orthographicCamera.updateProjectionMatrix()
      this.camera = this.orthographicCamera
    }

    const minDistance = Math.max(0.01, cfg.minDistance)
    const maxDistance = Math.max(minDistance, cfg.maxDistance)

    this.lastCameraLimits = {
      minPolarAngle: cfg.minPolarAngle,
      maxPolarAngle: cfg.maxPolarAngle,
      minAzimuthAngle: cfg.minAzimuthAngle,
      maxAzimuthAngle: cfg.maxAzimuthAngle,
      minDistance,
      maxDistance,
    }

    if (this.controls) {
      if (prev !== this.camera) {
        this.controls.object = this.camera
      }
      if (moveCamera) {
        this.controls.target.set(...cfg.target)
      }
      this.controls.minDistance = minDistance
      this.controls.maxDistance = maxDistance
      this.controls.minPolarAngle = cfg.minPolarAngle
      this.controls.maxPolarAngle = cfg.maxPolarAngle
      this.controls.minAzimuthAngle = cfg.minAzimuthAngle
      this.controls.maxAzimuthAngle = cfg.maxAzimuthAngle
      this.lastEnableDamping = cfg.enableDamping
      this.controls.enableDamping = cfg.enableDamping
      this.controls.dampingFactor = cfg.dampingFactor
      this.controls.zoomSpeed = cfg.zoomSpeed
      this.controls.rotateSpeed = cfg.rotateSpeed
      this.controls.panSpeed = cfg.panSpeed
      this.controls.update()
    }
    this.resize()
  }

  applyInteraction(cfg: InteractionConfig): void {
    if (!this.controls) return
    const rotateOn =
      cfg.enableRotate && (cfg.enableHorizontal || cfg.enableVertical)
    this.controls.enableRotate = rotateOn
    this.controls.enableZoom = cfg.enableZoom
    this.controls.enablePan = cfg.enablePan

    const limits = this.lastCameraLimits
    if (limits) {
      this.controls.minDistance = limits.minDistance
      this.controls.maxDistance = limits.maxDistance
      this.controls.minPolarAngle = limits.minPolarAngle
      this.controls.maxPolarAngle = limits.maxPolarAngle
      this.controls.minAzimuthAngle = limits.minAzimuthAngle
      this.controls.maxAzimuthAngle = limits.maxAzimuthAngle
    }

    if (rotateOn && !cfg.enableVertical) {
      const polar = this.controls.getPolarAngle()
      this.controls.minPolarAngle = polar
      this.controls.maxPolarAngle = polar
    }

    if (rotateOn && !cfg.enableHorizontal) {
      const az = this.controls.getAzimuthalAngle()
      this.controls.minAzimuthAngle = az
      this.controls.maxAzimuthAngle = az
    }

    // Movimiento reducido apaga inercia; al desactivarlo se restaura la de Cámara
    this.controls.enableDamping = cfg.reducedMotion ? false : this.lastEnableDamping

    if (this.renderer) {
      this.renderer.domElement.style.touchAction = cfg.touchEnabled ? 'none' : 'auto'
    }
  }

  applyAutoRotate(cfg: AutoRotateConfig, reducedMotion = false): void {
    this.autoRotate = reducedMotion ? { ...cfg, enabled: false } : { ...cfg }
  }

  syncEditorLights(lights: EditorLight[]): void {
    const keep = new Set(lights.map((l) => l.id))
    for (const [id, light] of this.editorLights) {
      if (!keep.has(id)) {
        this.removeLightHelper(id)
        this.removeEditorLight(light)
        this.editorLights.delete(id)
      }
    }

    for (const def of lights) {
      // Ambient no se visualiza con helper y no tiene posición útil en glTF punctual,
      // pero sí se aplica (editor + importadas).
      let light = this.editorLights.get(def.id)
      if (!light || light.userData.kind !== def.kind) {
        if (light) {
          this.removeLightHelper(def.id)
          this.removeEditorLight(light)
        }
        light = this.createLight(def)
        light.userData.kind = def.kind
        this.editorLights.set(def.id, light)
        this.editorLightsRoot.add(light)
        if (light instanceof DirectionalLight || light instanceof SpotLight) {
          this.editorLightsRoot.add(light.target)
        }
      }
      this.updateLight(light, def)
      light.visible = def.enabled
      if (light instanceof DirectionalLight || light instanceof SpotLight) {
        light.target.visible = def.enabled
      }
      this.syncLightHelper(def.id, light, def)
    }
  }

  setShowLightHelpers(show: boolean): void {
    this.showLightHelpers = show
    if (!show) {
      this.clearLightHelpers()
      return
    }
    for (const [id, light] of this.editorLights) {
      const kind = light.userData.kind as EditorLight['kind'] | undefined
      this.syncLightHelper(id, light, {
        id,
        kind: kind ?? 'directional',
        name: id,
        enabled: light.visible,
        color: `#${light.color.getHexString()}`,
        intensity: light.intensity,
        source: 'editor',
      })
    }
  }

  getShowLightHelpers(): boolean {
    return this.showLightHelpers
  }

  private stripEmbeddedLights(root: Object3D): void {
    const remove: Object3D[] = []
    root.traverse((obj) => {
      if ((obj as Light).isLight) remove.push(obj)
    })
    for (const light of remove) {
      light.parent?.remove(light)
      disposeObject3D(light)
    }
  }

  private helperSize(): number {
    this.modelRoot.updateMatrixWorld(true)
    const box = new Box3().setFromObject(this.modelRoot)
    if (box.isEmpty()) return 1
    const size = box.getSize(new Vector3())
    return Math.max(size.x, size.y, size.z, 0.5) * 0.25
  }

  private syncLightHelper(id: string, light: Light, def: EditorLight): void {
    if (!this.showLightHelpers || def.kind === 'ambient' || !def.enabled) {
      this.removeLightHelper(id)
      return
    }
    let helper = this.lightHelpers.get(id)
    const kindChanged = helper && helper.userData.kind !== def.kind
    if (!helper || kindChanged) {
      this.removeLightHelper(id)
      const size = this.helperSize()
      if (light instanceof DirectionalLight) {
        helper = new DirectionalLightHelper(light, size, light.color)
      } else if (light instanceof PointLight) {
        helper = new PointLightHelper(light, size * 0.35, light.color)
      } else if (light instanceof SpotLight) {
        helper = new SpotLightHelper(light, light.color)
      } else if (light instanceof HemisphereLight) {
        helper = new HemisphereLightHelper(light, size * 0.5)
      } else {
        return
      }
      helper.userData.kind = def.kind
      this.lightHelpers.set(id, helper)
      this.helpersRoot.add(helper)
    }
    helper.visible = true
    helper.update()
  }

  private removeLightHelper(id: string): void {
    const helper = this.lightHelpers.get(id)
    if (!helper) return
    this.helpersRoot.remove(helper)
    disposeObject3D(helper)
    this.lightHelpers.delete(id)
  }

  private clearLightHelpers(): void {
    for (const id of [...this.lightHelpers.keys()]) {
      this.removeLightHelper(id)
    }
  }

  private removeEditorLight(light: Light): void {
    if (light instanceof DirectionalLight || light instanceof SpotLight) {
      this.editorLightsRoot.remove(light.target)
    }
    this.editorLightsRoot.remove(light)
    light.dispose()
  }

  private createLight(def: EditorLight): Light {
    switch (def.kind) {
      case 'ambient':
        return new AmbientLight(def.color, def.intensity)
      case 'hemisphere':
        return new HemisphereLight(def.color, '#222222', def.intensity)
      case 'directional':
        return new DirectionalLight(def.color, def.intensity)
      case 'point':
        return new PointLight(def.color, def.intensity, def.distance ?? 0)
      case 'spot':
        return new SpotLight(
          def.color,
          def.intensity,
          def.distance ?? 0,
          def.angle ?? Math.PI / 6,
          def.penumbra ?? 0.2,
        )
      default:
        return new AmbientLight(def.color, def.intensity)
    }
  }

  private updateLight(light: Light, def: EditorLight): void {
    light.color.set(def.color)
    light.intensity = def.intensity
    if ('position' in light && def.position) {
      ;(light as DirectionalLight).position.set(...def.position)
    }
    if (light instanceof SpotLight) {
      light.angle = def.angle ?? light.angle
      light.penumbra = def.penumbra ?? light.penumbra
      light.distance = def.distance ?? light.distance
      light.castShadow = !!def.castShadow
      if (def.target) light.target.position.set(...def.target)
    }
    if (light instanceof PointLight) {
      light.distance = def.distance ?? light.distance
    }
    if (light instanceof DirectionalLight) {
      light.castShadow = !!def.castShadow
      if (def.target) light.target.position.set(...def.target)
    }
  }

  applyModelTransform(
    scale: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ): void {
    this.modelRoot.scale.setScalar(scale)
    this.modelRoot.position.set(...position)
    this.modelRoot.rotation.set(
      MathUtils.degToRad(rotation[0]),
      MathUtils.degToRad(rotation[1]),
      MathUtils.degToRad(rotation[2]),
    )
  }

  applySceneConfig(config: SceneConfig, opts?: { moveCamera?: boolean }): void {
    this.applyEnvironment(config.environment)
    this.applyCameraConfig(config.camera, { moveCamera: opts?.moveCamera === true })
    this.applyInteraction(config.interaction)
    this.applyAutoRotate(config.autoRotate, config.interaction.reducedMotion)
    this.syncEditorLights(config.lights)
    this.applyModelTransform(config.modelScale, config.modelPosition, config.modelRotation)
  }

  /** Aplica cambios parciales sin mover la cámara salvo que se pida. */
  patchScene(config: SceneConfig, changed: (keyof SceneConfig)[], opts?: { moveCamera?: boolean }): void {
    if (changed.includes('environment')) this.applyEnvironment(config.environment)
    if (changed.includes('camera')) {
      this.applyCameraConfig(config.camera, { moveCamera: opts?.moveCamera === true })
    }
    if (changed.includes('interaction')) {
      this.applyInteraction(config.interaction)
      this.applyAutoRotate(config.autoRotate, config.interaction.reducedMotion)
    }
    if (changed.includes('autoRotate')) {
      this.applyAutoRotate(config.autoRotate, config.interaction.reducedMotion)
    }
    if (changed.includes('lights')) this.syncEditorLights(config.lights)
    if (
      changed.includes('modelScale') ||
      changed.includes('modelPosition') ||
      changed.includes('modelRotation')
    ) {
      this.applyModelTransform(config.modelScale, config.modelPosition, config.modelRotation)
    }
  }

  getCamera(): Camera {
    return this.camera
  }

  getControls(): OrbitControls | null {
    return this.controls
  }

  captureCameraState(): { position: [number, number, number]; target: [number, number, number] } {
    const t = this.controls?.target ?? new Vector3()
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [t.x, t.y, t.z],
    }
  }

  /** Estado de cámara/límites tal como está ahora en el visor (para el panel Escena). */
  captureLiveCameraPatch(): LiveCameraPatch {
    const { position, target } = this.captureCameraState()
    let minDistance =
      this.lastCameraLimits?.minDistance ?? this.controls?.minDistance ?? 0.5
    let maxDistance =
      this.lastCameraLimits?.maxDistance ?? this.controls?.maxDistance ?? 3
    minDistance = Math.max(0.01, minDistance)
    maxDistance = Math.max(minDistance, maxDistance)
    const patch: LiveCameraPatch = { position, target, minDistance, maxDistance }
    if (this.camera instanceof PerspectiveCamera) {
      patch.fov = this.camera.fov
    }
    return patch
  }

  /**
   * Miniatura con encuadre por defecto (¾ centrado).
   * No altera la cámara/vista del usuario.
   */
  captureThumbnail(maxSize = 160): string | null {
    if (!this.renderer || !this.controls) return null
    const prevPos = this.camera.position.clone()
    const prevTarget = this.controls.target.clone()
    const prevMin = this.controls.minDistance
    const prevMax = this.controls.maxDistance
    const prevLimits = this.lastCameraLimits ? { ...this.lastCameraLimits } : null
    try {
      this.fitCameraToModel({ silent: true })
      this.renderer.render(this.scene, this.camera)
      const src = this.renderer.domElement
      const sw = src.width
      const sh = src.height
      if (sw < 2 || sh < 2) return null
      const scale = Math.min(1, maxSize / Math.max(sw, sh))
      const tw = Math.max(1, Math.round(sw * scale))
      const th = Math.max(1, Math.round(sh * scale))
      const tmp = document.createElement('canvas')
      tmp.width = tw
      tmp.height = th
      const ctx = tmp.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#121216'
      ctx.fillRect(0, 0, tw, th)
      ctx.drawImage(src, 0, 0, tw, th)
      return tmp.toDataURL('image/jpeg', 0.72)
    } catch {
      return null
    } finally {
      this.camera.position.copy(prevPos)
      this.controls.target.copy(prevTarget)
      this.controls.minDistance = prevMin
      this.controls.maxDistance = prevMax
      this.lastCameraLimits = prevLimits
      this.controls.update()
    }
  }

  dispose(): void {
    this.clearModel()
    this.unmount()
    this.clearLightHelpers()
    for (const light of this.editorLights.values()) {
      this.removeEditorLight(light)
    }
    this.editorLights.clear()
    this.setGrid(false)
    this.setAxes(false)
  }
}

let singleton: ViewerService | null = null

export function getViewerService(): ViewerService {
  if (!singleton) singleton = new ViewerService()
  return singleton
}
