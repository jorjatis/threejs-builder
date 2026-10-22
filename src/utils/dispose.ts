import type { Material, Object3D, Texture } from 'three'
import { Line, LineSegments, Mesh, Points, Sprite } from 'three'

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'bumpMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'emissiveMap',
  'aoMap',
  'lightMap',
  'envMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'specularIntensityMap',
  'specularColorMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
] as const

function collectTextures(material: Material, into: Set<Texture>): void {
  const mat = material as Material & Record<string, unknown>
  for (const slot of TEXTURE_SLOTS) {
    const value = mat[slot]
    if (value && typeof value === 'object' && 'isTexture' in (value as object)) {
      into.add(value as Texture)
    }
  }
  for (const key of Object.keys(mat)) {
    const value = mat[key]
    if (value && typeof value === 'object' && 'isTexture' in (value as object)) {
      into.add(value as Texture)
    }
  }
}

function disposeMaterial(material: Material, textures: Set<Texture>): void {
  collectTextures(material, textures)
  material.dispose()
}

function hasGeometry(
  obj: Object3D,
): obj is Object3D & { geometry?: { dispose?: () => void }; material?: Material | Material[] } {
  return (
    obj instanceof Mesh ||
    obj instanceof Line ||
    obj instanceof LineSegments ||
    obj instanceof Points ||
    obj instanceof Sprite
  )
}

/** Libera geometrías, materiales y texturas (una sola vez si están compartidas). */
export function disposeObject3D(root: Object3D): void {
  const textures = new Set<Texture>()
  root.traverse((obj) => {
    if (!hasGeometry(obj)) return
    obj.geometry?.dispose?.()
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of materials) {
      if (m) disposeMaterial(m, textures)
    }
  })
  for (const tex of textures) {
    tex.dispose()
  }
}
