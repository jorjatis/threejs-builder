import type { SceneConfig, JsExportMode } from '../types'

export interface GeneratedModule {
  fileName: string
  code: string
  dependencies: string[]
  instructions: string
}

/** Genera módulo JS tipado según modo de integración y configuración de escena. */
export function generateJsModule(
  mode: JsExportMode,
  config: SceneConfig,
  modelFileName: string,
): GeneratedModule {
  if (mode === 'integrate') {
    return generateIntegrateModule(config, modelFileName)
  }
  return generateStandaloneModule(config, modelFileName)
}

function serializeConfig(config: SceneConfig): string {
  // Solo opciones relevantes activas
  const slim = {
    camera: {
      position: config.camera.position,
      target: config.camera.target,
      fov: config.camera.fov,
      minDistance: config.camera.minDistance,
      maxDistance: config.camera.maxDistance,
      minPolarAngle: config.camera.minPolarAngle,
      maxPolarAngle: config.camera.maxPolarAngle,
      enableDamping: config.camera.enableDamping,
      dampingFactor: config.camera.dampingFactor,
      zoomSpeed: config.camera.zoomSpeed,
      rotateSpeed: config.camera.rotateSpeed,
      panSpeed: config.camera.panSpeed,
      near: config.camera.near,
      far: config.camera.far,
    },
    interaction: {
      enableRotate: config.interaction.enableRotate,
      enableZoom: config.interaction.enableZoom,
      enablePan: config.interaction.enablePan,
      enableVertical: config.interaction.enableVertical,
      enableHorizontal: config.interaction.enableHorizontal,
    },
    autoRotate: config.autoRotate,
    environment: {
      background: config.environment.background,
      exposure: config.environment.exposure,
      maxPixelRatio: config.environment.maxPixelRatio,
    },
    lights: config.lights
      .filter((l) => l.source === 'editor' && l.enabled)
      .map((l) => ({
        kind: l.kind,
        color: l.color,
        intensity: l.intensity,
        position: l.position,
      })),
    model: {
      scale: config.modelScale,
      position: config.modelPosition,
      rotation: config.modelRotation,
    },
    editorial: {
      altText: config.editorial.altTextEnabled ? config.editorial.altText : undefined,
      credits: config.editorial.creditsEnabled ? config.editorial.credits : undefined,
      title: config.editorial.titleEnabled ? config.editorial.title : undefined,
    },
  }
  return JSON.stringify(slim, null, 2)
}

function generateIntegrateModule(config: SceneConfig, modelFileName: string): GeneratedModule {
  const needsControls =
    config.interaction.enableRotate ||
    config.interaction.enableZoom ||
    config.interaction.enablePan ||
    config.autoRotate.enabled

  const code = `/**
 * Módulo de integración para escena Three.js existente.
 * No crea renderer ni bucle rAF propios: usa los del anfitrión.
 *
 * Dependencias del proyecto anfitrión:
 * - three
 * - three/addons/loaders/GLTFLoader.js
${needsControls ? ' * - three/addons/controls/OrbitControls.js (si aplicas controles aquí)\n' : ''} * - three/addons/loaders/DRACOLoader.js (si el GLB usa Draco)
 * - three/addons/libs/meshopt_decoder.module.js (si usa Meshopt)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
${needsControls ? "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n" : ''}
export const MODEL_URL = './${modelFileName}';

export const defaultConfig = ${serializeConfig(config)};

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.Camera} [opts.camera]
 * @param {THREE.WebGLRenderer} [opts.renderer]
 * @param {HTMLElement} [opts.domElement] - necesario si se crean OrbitControls
 * @param {object} [opts.config]
 * @param {string} [opts.modelUrl]
 * @returns {Promise<{ group: THREE.Group, mixer: THREE.AnimationMixer|null, controls: object|null, dispose: Function, update: Function }>}
 */
export async function createModelScene({
  scene,
  camera,
  renderer,
  domElement,
  config = defaultConfig,
  modelUrl = MODEL_URL,
} = {}) {
  if (!scene) throw new Error('createModelScene: se requiere una escena Three.js existente.');

  const group = new THREE.Group();
  group.name = 'NarrativeModel';
  scene.add(group);

  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(modelUrl);
  } catch (err) {
    scene.remove(group);
    throw new Error('No se pudo cargar el modelo: ' + (err?.message || err));
  }

  const root = gltf.scene;
  const m = config.model || {};
  root.scale.setScalar(m.scale ?? 1);
  if (m.position) root.position.fromArray(m.position);
  if (m.rotation) {
    root.rotation.set(
      THREE.MathUtils.degToRad(m.rotation[0] || 0),
      THREE.MathUtils.degToRad(m.rotation[1] || 0),
      THREE.MathUtils.degToRad(m.rotation[2] || 0),
    );
  }
  group.add(root);

  let mixer = null;
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
  }

  // Luces de editor (opcionales; no tocan luces previas de la escena)
  const lightGroup = new THREE.Group();
  lightGroup.name = 'NarrativeLights';
  for (const l of config.lights || []) {
    let light;
    if (l.kind === 'ambient') light = new THREE.AmbientLight(l.color, l.intensity);
    else if (l.kind === 'hemisphere') light = new THREE.HemisphereLight(l.color, '#222', l.intensity);
    else if (l.kind === 'directional') {
      light = new THREE.DirectionalLight(l.color, l.intensity);
      if (l.position) light.position.fromArray(l.position);
    } else if (l.kind === 'point') {
      light = new THREE.PointLight(l.color, l.intensity);
      if (l.position) light.position.fromArray(l.position);
    } else continue;
    lightGroup.add(light);
  }
  group.add(lightGroup);

${needsControls ? `
  let controls = null;
  if (camera && domElement) {
    controls = new OrbitControls(camera, domElement);
    const c = config.camera || {};
    const i = config.interaction || {};
    if (c.target) controls.target.fromArray(c.target);
    controls.enableDamping = c.enableDamping ?? true;
    controls.dampingFactor = c.dampingFactor ?? 0.08;
    if (c.zoomSpeed != null) controls.zoomSpeed = c.zoomSpeed;
    if (c.rotateSpeed != null) controls.rotateSpeed = c.rotateSpeed;
    if (c.panSpeed != null) controls.panSpeed = c.panSpeed;
    const rotateOn = (i.enableRotate ?? true) && ((i.enableHorizontal ?? true) || (i.enableVertical ?? true));
    controls.enableRotate = rotateOn;
    controls.enableZoom = i.enableZoom ?? true;
    controls.enablePan = i.enablePan ?? false;
    if (i.reducedMotion) controls.enableDamping = false;
    if (c.minDistance != null) controls.minDistance = c.minDistance;
    if (c.maxDistance != null) controls.maxDistance = c.maxDistance;
    if (c.minPolarAngle != null) controls.minPolarAngle = c.minPolarAngle;
    if (c.maxPolarAngle != null) controls.maxPolarAngle = c.maxPolarAngle;
    if (rotateOn && !i.enableVertical) {
      const polar = controls.getPolarAngle();
      controls.minPolarAngle = polar;
      controls.maxPolarAngle = polar;
    }
    if (rotateOn && i.enableHorizontal === false) {
      const az = controls.getAzimuthalAngle();
      controls.minAzimuthAngle = az;
      controls.maxAzimuthAngle = az;
    }
    const ar = config.autoRotate || {};
    controls.autoRotate = i.reducedMotion ? false : !!ar.enabled;
    controls.autoRotateSpeed = (ar.speed || 1) * (ar.direction || 1) * 2;
  }
` : '  const controls = null;\n'}

  function update(deltaSeconds) {
    if (mixer) mixer.update(deltaSeconds);
    if (controls) controls.update();
  }

  function dispose() {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          for (const key of Object.keys(mat)) {
            const v = mat[key];
            if (v && v.isTexture) v.dispose();
          }
          mat.dispose?.();
        }
      }
    });
    controls?.dispose?.();
    mixer = null;
  }

  return { group, mixer, controls, dispose, update, config };
}
`

  return {
    fileName: 'createModelScene.js',
    code,
    dependencies: ['three', ...(needsControls ? ['OrbitControls'] : []), 'GLTFLoader'],
    instructions: `En tu main.js:

import { createModelScene } from './createModelScene.js';

const handle = await createModelScene({
  scene,
  camera,
  renderer,
  domElement: renderer.domElement,
});

// Dentro de tu bucle existente:
function animate(t) {
  requestAnimationFrame(animate);
  handle.update(clock.getDelta());
  renderer.render(scene, camera);
}

// Al desmontar:
handle.dispose();
`,
  }
}

function generateStandaloneModule(config: SceneConfig, modelFileName: string): GeneratedModule {
  const code = `/**
 * Visor autónomo: crea renderer, cámara, luces y controles.
 * Inserta el canvas en un contenedor HTML dado.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const MODEL_URL = './${modelFileName}';
export const defaultConfig = ${serializeConfig(config)};

/**
 * @param {HTMLElement} container
 * @param {object} [userConfig]
 */
export function createModelViewer(container, userConfig = {}) {
  if (!container) throw new Error('createModelViewer: contenedor requerido');
  const config = { ...defaultConfig, ...userConfig, camera: { ...defaultConfig.camera, ...(userConfig.camera||{}) }, interaction: { ...defaultConfig.interaction, ...(userConfig.interaction||{}) }, autoRotate: { ...defaultConfig.autoRotate, ...(userConfig.autoRotate||{}) }, environment: { ...defaultConfig.environment, ...(userConfig.environment||{}) } };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.environment.background || '#111');

  const camera = new THREE.PerspectiveCamera(
    config.camera.fov || 45,
    1,
    config.camera.near ?? 0.1,
    config.camera.far ?? 2000,
  );
  camera.position.fromArray(config.camera.position || [0, 1.5, 4]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.environment.maxPixelRatio || 2));
  renderer.toneMappingExposure = config.environment.exposure ?? 1;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = config.camera.enableDamping ?? true;
  controls.dampingFactor = config.camera.dampingFactor ?? 0.08;
  controls.zoomSpeed = config.camera.zoomSpeed ?? 1;
  controls.rotateSpeed = config.camera.rotateSpeed ?? 1;
  controls.panSpeed = config.camera.panSpeed ?? 1;
  controls.target.fromArray(config.camera.target || [0, 0, 0]);
  controls.enableRotate = config.interaction.enableRotate ?? true;
  controls.enableZoom = config.interaction.enableZoom ?? true;
  controls.enablePan = config.interaction.enablePan ?? false;
  controls.autoRotate = !!config.autoRotate.enabled;
  controls.autoRotateSpeed = (config.autoRotate.speed || 1) * (config.autoRotate.direction || 1) * 2;

  for (const l of config.lights || []) {
    let light;
    if (l.kind === 'ambient') light = new THREE.AmbientLight(l.color, l.intensity);
    else if (l.kind === 'hemisphere') light = new THREE.HemisphereLight(l.color, '#222', l.intensity);
    else if (l.kind === 'directional') {
      light = new THREE.DirectionalLight(l.color, l.intensity);
      if (l.position) light.position.fromArray(l.position);
    } else continue;
    scene.add(light);
  }

  let mixer = null;
  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();
  const group = new THREE.Group();
  scene.add(group);

  const loader = new GLTFLoader();
  const ready = loader.loadAsync(userConfig.modelUrl || MODEL_URL).then((gltf) => {
    const root = gltf.scene;
    root.scale.setScalar(config.model?.scale ?? 1);
    group.add(root);
    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(root);
      for (const clip of gltf.animations) mixer.clipAction(clip).play();
    }
    fit();
  });

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function fit() {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 2.2;
    camera.position.copy(center.clone().add(new THREE.Vector3(dist * 0.6, dist * 0.4, dist)));
    controls.target.copy(center);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    mixer?.update(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
  }

  return {
    scene, camera, renderer, controls, group, ready, dispose,
    setAutoRotate(enabled) { controls.autoRotate = !!enabled; },
  };
}
`

  return {
    fileName: 'createModelViewer.js',
    code,
    dependencies: ['three', 'GLTFLoader', 'OrbitControls'],
    instructions: `<!-- HTML -->
<div id="viewer" style="width:100%;height:480px;"></div>
<script type="module">
  import { createModelViewer } from './createModelViewer.js';
  const viewer = createModelViewer(document.getElementById('viewer'));
  await viewer.ready;
  // viewer.dispose() al desmontar
</script>
`,
  }
}

export function generateReadme(opts: {
  projectName: string
  modelFileName: string
  mode: JsExportMode
  module: GeneratedModule
  report: string
}): string {
  return `# ${opts.projectName}

Paquete exportado desde **threejs-builder** (editor local de modelos 3D).

## Contenido

- \`${opts.modelFileName}\` — modelo glTF/GLB
- \`${opts.module.fileName}\` — módulo JavaScript (${opts.mode})
- \`optimization-report.md\` — informe de optimización

## Dependencias

${opts.module.dependencies.map((d) => `- \`${d}\``).join('\n')}

Three.js debe resolverse desde el proyecto anfitrión (no se incluye una segunda copia del renderizador).

## Integración

${opts.module.instructions}

## Informe

${opts.report}

## Privacidad

Todo el procesamiento se realizó en el navegador. Este paquete no contiene telemetría.
`
}
