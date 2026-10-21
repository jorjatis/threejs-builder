# Integración en escena Three.js existente

```js
import * as THREE from 'three'
import { createModelScene } from './createModelScene.js'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ antialias: true })
const clock = new THREE.Clock()

const handle = await createModelScene({
  scene,
  camera,
  renderer,
  domElement: renderer.domElement,
  modelUrl: './modelo-optimizado.glb',
})

function animate() {
  requestAnimationFrame(animate)
  handle.update(clock.getDelta())
  renderer.render(scene, camera)
}
animate()

// Al desmontar la pieza editorial:
// handle.dispose()
```

El módulo **no** crea un segundo renderer ni un segundo `requestAnimationFrame`.
