import type { Document } from '@gltf-transform/core'
import { inspect } from '@gltf-transform/functions'
import type { Object3D } from 'three'
import { Mesh, Box3, BufferGeometry } from 'three'
import type { ModelStats, StatValue, TextureDimensions } from '../types'

function exact(value: number): StatValue {
  return { value, confidence: 'exact' }
}

function unavailable(): StatValue {
  return { value: null, confidence: 'unavailable' }
}

function estimated(value: number, label?: string): StatValue {
  return { value, confidence: 'estimated', label }
}

/** Estadísticas a partir del documento glTF Transform (fuente de verdad del archivo). */
export function inspectDocument(
  document: Document,
  meta: { fileName: string; fileSizeBytes: number; format: 'glb' | 'gltf' },
): ModelStats {
  const root = document.getRoot()
  const report = inspect(document)

  let vertices = 0
  let triangles = 0
  let primitives = 0
  for (const mesh of report.meshes.properties) {
    vertices += mesh.vertices
    // glPrimitives = número de primitivas GL (triángulos / líneas / puntos según mode)
    triangles += mesh.glPrimitives
    primitives += mesh.meshPrimitives
  }

  const textureDimensions: TextureDimensions[] = root.listTextures().map((tex) => {
    const size = tex.getSize()
    return { width: size?.[0] ?? 0, height: size?.[1] ?? 0 }
  })

  const usedNames = new Set(root.listExtensionsUsed().map((e) => e.extensionName))
  const requiredNames = new Set(
    root.listExtensionsRequired().map((e) => e.extensionName),
  )
  // Preferir required + evidencia en primitivas: listExtensionsUsed a veces
  // deja Meshopt y Draco a la vez tras el I/O aunque solo uno aplique.
  const hasDracoApplied =
    requiredNames.has('KHR_draco_mesh_compression') ||
    root
      .listMeshes()
      .some((m) =>
        m.listPrimitives().some((p) => p.getExtension('KHR_draco_mesh_compression')),
      )
  const hasMeshoptApplied =
    requiredNames.has('EXT_meshopt_compression') ||
    (!hasDracoApplied && usedNames.has('EXT_meshopt_compression'))

  const uniqueExt = [
    ...new Set([...usedNames, ...requiredNames]),
  ].filter((e) => {
    if (e === 'KHR_draco_mesh_compression') return hasDracoApplied
    if (e === 'EXT_meshopt_compression') return hasMeshoptApplied
    return true
  })
  if (hasDracoApplied && !uniqueExt.includes('KHR_draco_mesh_compression')) {
    uniqueExt.push('KHR_draco_mesh_compression')
  }
  if (hasMeshoptApplied && !uniqueExt.includes('EXT_meshopt_compression')) {
    uniqueExt.push('EXT_meshopt_compression')
  }

  const compatibilityNotes: string[] = []
  if (hasDracoApplied) {
    compatibilityNotes.push('Requiere decodificador Draco en el cliente de visualización.')
  }
  if (hasMeshoptApplied) {
    compatibilityNotes.push('Requiere EXT_meshopt_compression / MeshoptDecoder.')
  }
  if (uniqueExt.some((e) => e.startsWith('KHR_materials_'))) {
    compatibilityNotes.push('Usa extensiones de materiales; verifica soporte del visor destino.')
  }

  let geometryMemory = 0
  for (const acc of root.listAccessors()) {
    geometryMemory += acc.getArray()?.byteLength ?? 0
  }

  let textureMemory = 0
  for (const tex of root.listTextures()) {
    const img = tex.getImage()
    if (img) textureMemory += img.byteLength
    else {
      const size = tex.getSize()
      if (size) textureMemory += size[0] * size[1] * 4
    }
  }

  // Luces punctuales vía extensión
  let lightCount = 0
  try {
    for (const node of root.listNodes()) {
      if (node.getExtension('KHR_lights_punctual')) lightCount += 1
    }
  } catch {
    lightCount = 0
  }

  return {
    fileName: meta.fileName,
    fileSizeBytes: meta.fileSizeBytes,
    format: meta.format,
    scenes: exact(root.listScenes().length),
    nodes: exact(root.listNodes().length),
    meshes: exact(root.listMeshes().length),
    primitives: exact(primitives),
    vertices: exact(vertices),
    triangles: exact(triangles),
    materials: exact(root.listMaterials().length),
    textures: exact(root.listTextures().length),
    textureDimensions,
    animations: exact(root.listAnimations().length),
    cameras: exact(root.listCameras().length),
    lights: exact(lightCount),
    extensions: uniqueExt,
    drawCalls: unavailable(),
    geometryMemoryBytes: estimated(geometryMemory, 'Suma de accessors'),
    textureMemoryBytes: estimated(textureMemory, 'Buffers de imagen / estimación RGBA'),
    compatibilityNotes,
  }
}

/** Draw calls medidos recorriendo la escena Three.js cargada. */
export function measureSceneDrawCalls(root: Object3D): {
  drawCalls: number
  vertices: number
  triangles: number
} {
  let drawCalls = 0
  let vertices = 0
  let triangles = 0
  root.traverse((obj) => {
    if (obj instanceof Mesh && obj.geometry) {
      drawCalls += 1
      const geo = obj.geometry as BufferGeometry
      const pos = geo.getAttribute('position')
      if (pos) vertices += pos.count
      const index = geo.index
      if (index) triangles += index.count / 3
      else if (pos) triangles += pos.count / 3
    }
  })
  return {
    drawCalls,
    vertices,
    triangles: Math.round(triangles),
  }
}

export function computeBoundingBox(root: Object3D): Box3 {
  return new Box3().setFromObject(root)
}
