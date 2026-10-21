import type { Material, Object3D, Texture } from 'three'
import { Mesh } from 'three'

function disposeMaterial(material: Material): void {
  const mat = material as Material & Record<string, unknown>
  for (const key of Object.keys(mat)) {
    const value = mat[key]
    if (value && typeof value === 'object' && 'isTexture' in (value as object)) {
      ;(value as Texture).dispose()
    }
  }
  material.dispose()
}

/** Libera geometrías, materiales y texturas de un Object3D y sus hijos. */
export function disposeObject3D(root: Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry?.dispose()
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of materials) {
        if (m) disposeMaterial(m)
      }
    }
  })
}
