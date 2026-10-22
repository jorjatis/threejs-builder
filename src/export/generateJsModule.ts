import type { SceneConfig, JsExportMode } from '../types'

/** Versión de three alineada con el editor (CDN / snippets). */
const THREE_CDN = '0.180.0'

export interface IntegrationSnippets {
  /** Módulo ESM completo (con import/export). */
  jsWithImports: string
  /** Mismo módulo sin import/export (para scripts.js). */
  jsWithoutImports: string
  /** Trozo para main.js (desarrollo con imports). */
  mainWithImports: string
  /** Trozo para producción (todo tirado, sin export). */
  mainInlined: string
  /** Tags &lt;script&gt; CDN + scripts.js. */
  cdnScripts: string
}

export interface GeneratedModule {
  fileName: string
  /** ESM con imports (archivo principal). */
  code: string
  /** Sin imports (archivo .inline.js). */
  inlineCode: string
  inlineFileName: string
  dependencies: string[]
  /** Informe de integración en Markdown (secciones claras). */
  instructions: string
  snippets: IntegrationSnippets
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
      textAboveParagraphs: config.editorial.textAboveEnabled
        ? config.editorial.textAboveParagraphs
        : 0,
      textBelowParagraphs: config.editorial.textBelowEnabled
        ? config.editorial.textBelowParagraphs
        : 0,
      rotateHelpEnabled: config.editorial.rotateHelpEnabled,
      lazyLoad: config.editorial.lazyLoad,
    },
  }
  return JSON.stringify(slim, null, 2)
}

function buildCreateModelSceneFn(needsControls: boolean): string {
  return `async function createModelScene({
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

${
  needsControls
    ? `
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
`
    : '  const controls = null;\n'
}

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
}`
}

function fence(lang: string, body: string): string {
  return '```' + lang + '\n' + body.trimEnd() + '\n```'
}

function buildIntegrationGuide(
  snippets: IntegrationSnippets,
  files: { withImports: string; withoutImports: string; modulesPath: string },
): string {
  return `# Guía de integración

Copia cada bloque según el entorno. Los archivos JS del paquete son:

- \`${files.withImports}\` — con imports (desarrollo / módulos)
- \`${files.withoutImports}\` — sin imports (producción / scripts.js)

---

## 1. JS con imports

Archivo: \`${files.withImports}\`  
Uso: arrástralo a \`${files.modulesPath}\`.

${fence('js', snippets.jsWithImports)}

---

## 2. JS sin imports

Archivo: \`${files.withoutImports}\`  
Uso: pégalo dentro de \`scripts.js\` (o cárgalo tras los CDN). Requiere \`THREE\` global y \`GLTFLoader\` / \`OrbitControls\` en global o en \`THREE.*\`.

${fence('js', snippets.jsWithoutImports)}

---

## 3. Trozo para main.js (con imports)

En desarrollo, junto al resto de módulos y dentro de \`initAll()\`:

${fence('js', snippets.mainWithImports)}

---

## 4. Trozo para producción (todo tirado)

Sin \`import\` / \`export\`. El código del módulo ya va dentro de \`scripts.js\`:

${fence('js', snippets.mainInlined)}

---

## 5. Scripts CDN

En el HTML de producción, **antes** de \`scripts.js\`:

${fence('html', snippets.cdnScripts)}
`
}

function generateIntegrateModule(config: SceneConfig, modelFileName: string): GeneratedModule {
  const needsControls =
    config.interaction.enableRotate ||
    config.interaction.enableZoom ||
    config.interaction.enablePan ||
    config.autoRotate.enabled

  const configJson = serializeConfig(config)
  const fnBody = buildCreateModelSceneFn(needsControls)

  const jsWithImports = `/**
 * Módulo de integración para escena Three.js existente.
 * No crea renderer ni bucle rAF propios: usa los del anfitrión.
 *
 * Dependencias: three, GLTFLoader${needsControls ? ', OrbitControls' : ''}
 * (Draco / Meshopt solo si el GLB los usa).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
${needsControls ? "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n" : ''}
export const MODEL_URL = './${modelFileName}';

export const defaultConfig = ${configJson};

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.Camera} [opts.camera]
 * @param {THREE.WebGLRenderer} [opts.renderer]
 * @param {HTMLElement} [opts.domElement]
 * @param {object} [opts.config]
 * @param {string} [opts.modelUrl]
 */
export ${fnBody}
`

  const jsWithoutImports = `/**
 * createModelScene — sin import/export (para scripts.js).
 * Requiere THREE en global (CDN).
 * GLTFLoader${needsControls ? ' y OrbitControls' : ''}: THREE.GLTFLoader / window.GLTFLoader${needsControls ? ' (igual OrbitControls)' : ''}.
 */
var MODEL_URL = './${modelFileName}';
var defaultConfig = ${configJson};
var GLTFLoader = (typeof THREE !== 'undefined' && THREE.GLTFLoader) || window.GLTFLoader;
${needsControls ? "var OrbitControls = (typeof THREE !== 'undefined' && THREE.OrbitControls) || window.OrbitControls;\n" : ''}
${fnBody}

window.createModelScene = createModelScene;
window.MODEL_URL = MODEL_URL;
window.defaultConfig = defaultConfig;
`

  const mainWithImports = `// NOTE: Modules
import { createModelScene } from './modules/createModelScene';

export function initAll() {
  document.body.classList.add('is-loaded');
  // ...resto de inits...

  void createModelScene({
    scene,
    camera,
    renderer,
    domElement: renderer.domElement,
  }).then((handle) => {
    // En tu rAF: handle.update(clock.getDelta());
    // Al desmontar: handle.dispose();
  });
}

window.addEventListener('load', initAll);`

  const mainInlined = `// Producción: todo tirado en scripts.js (sin import / export)
function initAll() {
  document.body.classList.add('is-loaded');
  // ...resto de inits...

  void createModelScene({
    scene,
    camera,
    renderer,
    domElement: renderer.domElement,
  });
}

initAll();`

  const cdnScripts = `<!-- Librerías por CDN, luego tu código en línea -->
<script src="https://cdn.jsdelivr.net/npm/three@${THREE_CDN}/build/three.min.js"></script>
<!-- Si pegas createModelScene.inline.js a mano, necesitas también GLTFLoader${needsControls ? ' (+ OrbitControls)' : ''}
     como global. Con webpack suelen ir ya dentro de scripts.js. -->
<script src="scripts.js"></script>`

  const snippets: IntegrationSnippets = {
    jsWithImports,
    jsWithoutImports,
    mainWithImports,
    mainInlined,
    cdnScripts,
  }

  const fileName = 'createModelScene.js'
  const inlineFileName = 'createModelScene.inline.js'
  return {
    fileName,
    code: jsWithImports,
    inlineCode: jsWithoutImports,
    inlineFileName,
    dependencies: ['three', ...(needsControls ? ['OrbitControls'] : []), 'GLTFLoader'],
    instructions: buildIntegrationGuide(snippets, {
      withImports: fileName,
      withoutImports: inlineFileName,
      modulesPath: 'src/js/modules/',
    }),
    snippets,
  }
}

function generateStandaloneModule(config: SceneConfig, modelFileName: string): GeneratedModule {
  const configJson = serializeConfig(config)

  const jsWithImports = `/**
 * Visor autónomo: crea renderer, cámara, luces y controles.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const MODEL_URL = './${modelFileName}';
export const defaultConfig = ${configJson};

/**
 * @param {HTMLElement} container
 * @param {object} [userConfig]
 */
export function createModelViewer(container, userConfig = {}) {
  if (!container) throw new Error('createModelViewer: contenedor requerido');
  const config = { ...defaultConfig, ...userConfig, camera: { ...defaultConfig.camera, ...(userConfig.camera||{}) }, interaction: { ...defaultConfig.interaction, ...(userConfig.interaction||{}) }, autoRotate: { ...defaultConfig.autoRotate, ...(userConfig.autoRotate||{}) }, environment: { ...defaultConfig.environment, ...(userConfig.environment||{}) } };

  const scene = new THREE.Scene();

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
  {
    const raw = config.environment.background || '#111111';
    let hex = '#111111';
    let alpha = 1;
    if (raw === 'transparent' || raw === 'none') alpha = 0;
    else if (typeof raw === 'string' && raw.startsWith('#')) {
      const h = raw.slice(1);
      if (h.length === 8) {
        hex = '#' + h.slice(0, 6);
        alpha = parseInt(h.slice(6, 8), 16) / 255;
      } else if (h.length === 6 || h.length === 3) hex = raw.length === 4
        ? '#' + h.split('').map((c) => c + c).join('')
        : raw;
    }
    if (alpha >= 0.999) {
      scene.background = new THREE.Color(hex);
      renderer.setClearColor(hex, 1);
    } else {
      scene.background = null;
      renderer.setClearColor(hex, alpha);
    }
  }
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

  const jsWithoutImports = `/**
 * createModelViewer — sin import/export (para scripts.js).
 * Requiere THREE, GLTFLoader y OrbitControls en global.
 */
var GLTFLoader = (typeof THREE !== 'undefined' && THREE.GLTFLoader) || window.GLTFLoader;
var OrbitControls = (typeof THREE !== 'undefined' && THREE.OrbitControls) || window.OrbitControls;

${jsWithImports
  .replace(/^import .+$/gm, '')
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '')
  .replace(/^export const /gm, 'var ')
  .replace(/^export function /gm, 'function ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()}

window.createModelViewer = createModelViewer;
window.MODEL_URL = MODEL_URL;
window.defaultConfig = defaultConfig;
`

  const mainWithImports = `import { createModelViewer } from './modules/createModelViewer';

export function initAll() {
  const viewer = createModelViewer(document.getElementById('viewer'));
  void viewer.ready;
}

window.addEventListener('load', initAll);`

  const mainInlined = `function initAll() {
  const viewer = createModelViewer(document.getElementById('viewer'));
  void viewer.ready;
}

initAll();`

  const cdnScripts = `<script src="https://cdn.jsdelivr.net/npm/three@${THREE_CDN}/build/three.min.js"></script>
<script src="scripts.js"></script>`

  const snippets: IntegrationSnippets = {
    jsWithImports,
    jsWithoutImports,
    mainWithImports,
    mainInlined,
    cdnScripts,
  }

  const fileName = 'createModelViewer.js'
  const inlineFileName = 'createModelViewer.inline.js'
  return {
    fileName,
    code: jsWithImports,
    inlineCode: jsWithoutImports,
    inlineFileName,
    dependencies: ['three', 'GLTFLoader', 'OrbitControls'],
    instructions: buildIntegrationGuide(snippets, {
      withImports: fileName,
      withoutImports: inlineFileName,
      modulesPath: 'src/js/modules/',
    }),
    snippets,
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

Paquete exportado desde **threejs-builder**.

## Contenido

- \`${opts.modelFileName}\` — modelo glTF/GLB
- \`${opts.module.fileName}\` — JS **con** imports
- \`${opts.module.inlineFileName}\` — JS **sin** imports
- \`INTEGRATION.md\` — guía de copiar/pegar (main, producción, CDN)
- \`optimization-report.md\` — informe de optimización

## Dependencias

${opts.module.dependencies.map((d) => `- \`${d}\``).join('\n')}

Three.js se resuelve desde el proyecto anfitrión o por CDN (ver \`INTEGRATION.md\` §5).

## Integración

Ver **\`INTEGRATION.md\`** (bloques numerados 1–5).

## Informe de optimización

${opts.report}

## Privacidad

Todo el procesamiento se realizó en el navegador. Este paquete no contiene telemetría.
`
}
