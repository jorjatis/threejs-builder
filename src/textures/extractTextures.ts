import type { Document, Texture as GltfTexture, Material } from '@gltf-transform/core'
import { listTextureSlots } from '@gltf-transform/functions'
import type { TextureInfo, TextureMapRole, TextureUsage } from '../types'
import { createId } from '../utils/id'

function roleFromSlot(slot: string): TextureMapRole {
  const s = slot.toLowerCase()
  if (s.includes('basecolor') || s.includes('diffuse') || s === 'basecolortexture') return 'baseColor'
  if (s.includes('normal')) return 'normal'
  if (s.includes('metallic') || s.includes('roughness') || s.includes('specular')) return 'metallicRoughness'
  if (s.includes('occlusion') || s.includes('ao')) return 'occlusion'
  if (s.includes('emissive')) return 'emissive'
  if (slot) return 'other'
  return 'unknown'
}

async function imageBitmapFromTexture(tex: GltfTexture): Promise<{
  width: number
  height: number
  thumbnailDataUrl: string | null
  decodedBytes: number
} | null> {
  const image = tex.getImage()
  if (!image) return null
  const mime = tex.getMimeType() || 'image/png'
  const blob = new Blob([image.slice()], { type: mime })
  try {
    const bmp = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    const thumbSize = 128
    const scale = Math.min(1, thumbSize / Math.max(bmp.width, bmp.height))
    canvas.width = Math.max(1, Math.round(bmp.width * scale))
    canvas.height = Math.max(1, Math.round(bmp.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return { width: bmp.width, height: bmp.height, thumbnailDataUrl: null, decodedBytes: bmp.width * bmp.height * 4 }
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const thumbnailDataUrl = canvas.toDataURL('image/png')
    const width = bmp.width
    const height = bmp.height
    bmp.close()
    return {
      width,
      height,
      thumbnailDataUrl,
      decodedBytes: width * height * 4,
    }
  } catch {
    const size = tex.getSize()
    return {
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
      thumbnailDataUrl: null,
      decodedBytes: image.byteLength,
    }
  }
}

function findUsages(document: Document, texture: GltfTexture): TextureUsage[] {
  const usages: TextureUsage[] = []
  const root = document.getRoot()
  const slots = listTextureSlots(texture)

  for (const material of root.listMaterials()) {
    for (const slot of slots) {
      const tex = getMaterialTexture(material, slot)
      if (tex !== texture) continue
      const objectNames: string[] = []
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          if (prim.getMaterial() === material) {
            objectNames.push(mesh.getName() || '(mesh)')
          }
        }
      }
      usages.push({
        materialName: material.getName() || '(sin nombre)',
        materialUuid: material.getName() || createId('mat'),
        slot,
        role: roleFromSlot(slot),
        objectNames: [...new Set(objectNames)],
      })
    }
  }
  return usages
}

function getMaterialTexture(material: Material, slot: string): GltfTexture | null {
  // API tipada vía getTexture / texture infos
  const map: Record<string, () => GltfTexture | null> = {
    baseColorTexture: () => material.getBaseColorTexture(),
    metallicRoughnessTexture: () => material.getMetallicRoughnessTexture(),
    normalTexture: () => material.getNormalTexture(),
    occlusionTexture: () => material.getOcclusionTexture(),
    emissiveTexture: () => material.getEmissiveTexture(),
  }
  if (map[slot]) return map[slot]()
  // Fallback: buscar por nombre de slot genérico
  try {
    const getter = (material as unknown as Record<string, unknown>)[`get${capitalize(slot)}`]
    if (typeof getter === 'function') {
      return (getter as () => GltfTexture | null).call(material)
    }
  } catch {
    /* ignore */
  }
  return null
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export async function extractTextureInventory(document: Document): Promise<TextureInfo[]> {
  const textures = document.getRoot().listTextures()
  const result: TextureInfo[] = []

  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i]
    const decoded = await imageBitmapFromTexture(tex)
    const size = tex.getSize()
    const image = tex.getImage()
    const usages = findUsages(document, tex)
    const roles = [...new Set(usages.map((u) => u.role))]

    const encodedBytes = image?.byteLength ?? 0
    const sizeBytes = encodedBytes || decoded?.decodedBytes || 0

    result.push({
      id: createId('tex'),
      name: tex.getName() || tex.getURI() || `textura_${i}`,
      uuid: `${i}_${tex.getName()}`,
      width: decoded?.width || size?.[0] || 0,
      height: decoded?.height || size?.[1] || 0,
      format: tex.getMimeType() || 'unknown',
      mimeType: tex.getMimeType(),
      sizeBytes,
      sizeConfidence: encodedBytes ? 'exact' : decoded ? 'estimated' : 'unavailable',
      roles: roles.length ? roles : ['unknown'],
      usages,
      active: true,
      thumbnailDataUrl: decoded?.thumbnailDataUrl ?? null,
      sourceImageData: null,
    })
  }

  return result
}

/** Copia los bytes de imagen de una textura del documento (estado actual de trabajo). */
export function snapshotTextureImage(
  document: Document,
  textureIndex: number,
): { image: Uint8Array; mimeType: string } | null {
  const tex = document.getRoot().listTextures()[textureIndex]
  if (!tex) return null
  const image = tex.getImage()
  if (!image) return null
  return {
    image: image.slice(),
    mimeType: tex.getMimeType() || 'image/png',
  }
}

function setMaterialTextureBySlot(
  material: Material,
  slot: string,
  texture: GltfTexture | null,
): boolean {
  const map: Record<string, (t: GltfTexture | null) => unknown> = {
    baseColorTexture: (t) => material.setBaseColorTexture(t),
    metallicRoughnessTexture: (t) => material.setMetallicRoughnessTexture(t),
    normalTexture: (t) => material.setNormalTexture(t),
    occlusionTexture: (t) => material.setOcclusionTexture(t),
    emissiveTexture: (t) => material.setEmissiveTexture(t),
  }
  if (map[slot]) {
    map[slot](texture)
    return true
  }
  return false
}

/** Elimina una textura del documento y limpia referencias de materiales. */
export function removeTextureFromDocument(document: Document, textureIndex: number): GltfTexture | null {
  const textures = document.getRoot().listTextures()
  const tex = textures[textureIndex]
  if (!tex) return null

  for (const material of document.getRoot().listMaterials()) {
    if (material.getBaseColorTexture() === tex) material.setBaseColorTexture(null)
    if (material.getMetallicRoughnessTexture() === tex) material.setMetallicRoughnessTexture(null)
    if (material.getNormalTexture() === tex) material.setNormalTexture(null)
    if (material.getOcclusionTexture() === tex) material.setOcclusionTexture(null)
    if (material.getEmissiveTexture() === tex) material.setEmissiveTexture(null)
  }

  tex.dispose()
  return tex
}

/** Redimensiona una textura concreta (máximo lado). */
export async function resizeSingleTexture(
  document: Document,
  textureIndex: number,
  maxSize: number,
): Promise<void> {
  const tex = document.getRoot().listTextures()[textureIndex]
  if (!tex) throw new Error('Textura no encontrada')
  const { compressTexture } = await import('@gltf-transform/functions')
  await compressTexture(tex, { resize: [maxSize, maxSize] })
}

/**
 * Aplica un máximo de lado a todas las texturas.
 * Si se pasa `original`, parte de la imagen original (así subir el tope regenera resolución).
 * Sin original, solo reduce las que superan maxSize.
 */
export async function resizeAllTextures(
  document: Document,
  maxSize: number,
  original?: Document | null,
): Promise<number> {
  const { compressTexture } = await import('@gltf-transform/functions')
  const list = document.getRoot().listTextures()
  let count = 0
  for (let i = 0; i < list.length; i++) {
    const tex = list[i]
    const name = tex.getName() || tex.getURI() || `textura_${i}`

    if (original) {
      const restored = restoreTextureImageFromOriginal(document, original, name)
      if (!restored) continue
    }

    const size = tex.getSize()
    const w = size?.[0] ?? 0
    const h = size?.[1] ?? 0
    const maxSide = Math.max(w, h)
    if (maxSide <= 0) continue
    if (maxSide > maxSize) {
      await compressTexture(tex, { resize: [maxSize, maxSize] })
      count += 1
    } else if (original) {
      // Ya estaba en original ≤ maxSize; cuenta como reaplicado
      count += 1
    }
  }
  return count
}

export type TextureEncodeFormat = 'webp' | 'jpeg'

/** Comprime (re-encode) todas las texturas al formato indicado. */
export async function compressAllTextures(
  document: Document,
  format: TextureEncodeFormat,
  quality = 0.8,
): Promise<number> {
  const { compressTexture } = await import('@gltf-transform/functions')
  const list = document.getRoot().listTextures()
  let count = 0
  for (const tex of list) {
    if (!tex.getImage()) continue
    await compressTexture(tex, {
      targetFormat: format,
      quality,
    })
    count += 1
  }
  return count
}

/** Comprime una textura por índice. */
export async function compressSingleTexture(
  document: Document,
  textureIndex: number,
  format: TextureEncodeFormat,
  quality = 0.8,
): Promise<void> {
  const tex = document.getRoot().listTextures()[textureIndex]
  if (!tex) throw new Error('Textura no encontrada')
  const { compressTexture } = await import('@gltf-transform/functions')
  await compressTexture(tex, { targetFormat: format, quality })
}

/** Índices de texturas sin ningún uso en materiales. */
export function listUnusedTextureIndices(document: Document): number[] {
  const list = document.getRoot().listTextures()
  const unused: number[] = []
  for (let i = 0; i < list.length; i++) {
    if (findUsages(document, list[i]).length === 0) unused.push(i)
  }
  return unused
}

/** Elimina texturas no referenciadas. Devuelve cuántas quitó. */
export function removeUnusedTextures(document: Document): number {
  const indices = listUnusedTextureIndices(document).sort((a, b) => b - a)
  for (const i of indices) {
    removeTextureFromDocument(document, i)
  }
  return indices.length
}

/** Restaura resolución (imagen) de todas las texturas activas desde el original. */
export function restoreAllTextureImagesFromOriginal(
  working: Document,
  original: Document,
): number {
  let n = 0
  for (const tex of working.getRoot().listTextures()) {
    const name = tex.getName() || tex.getURI() || ''
    if (!name) continue
    if (restoreTextureImageFromOriginal(working, original, name)) n += 1
  }
  return n
}

export function textureIndexByName(document: Document, name: string): number {
  return document
    .getRoot()
    .listTextures()
    .findIndex((t, i) => (t.getName() || t.getURI() || `textura_${i}`) === name)
}

/** Estimación heurística de bytes de texturas tras resize + formato. */
export function estimateTextureBytes(
  textures: TextureInfo[],
  opts: { maxSize: number; format: TextureEncodeFormat | 'keep'; quality: number },
): { current: number; estimated: number } {
  let current = 0
  let estimated = 0
  for (const t of textures) {
    if (!t.active) continue
    current += t.sizeBytes
    const maxSide = Math.max(t.width, t.height, 1)
    const scale = maxSide > opts.maxSize ? (opts.maxSize / maxSide) ** 2 : 1
    let bytes = t.sizeBytes * scale
    const mime = (t.mimeType || t.format || '').toLowerCase()
    if (opts.format === 'webp') {
      const already = mime.includes('webp')
      bytes *= already ? 0.95 : mime.includes('png') ? 0.35 : 0.55
      bytes *= 0.7 + opts.quality * 0.3
    } else if (opts.format === 'jpeg') {
      const already = mime.includes('jpeg') || mime.includes('jpg')
      bytes *= already ? 0.95 : mime.includes('png') ? 0.4 : 0.7
      bytes *= 0.65 + opts.quality * 0.35
    }
    estimated += Math.max(512, bytes)
  }
  return { current, estimated: Math.round(estimated) }
}

function findTextureByName(document: Document, name: string): GltfTexture | null {
  const list = document.getRoot().listTextures()
  const exact = list.find((t, i) => (t.getName() || t.getURI() || `textura_${i}`) === name)
  return exact ?? null
}

/** Tamaños originales (lado mayor) por nombre de textura. */
export async function mapOriginalTextureSizes(
  originalDoc: Document,
): Promise<Map<string, { width: number; height: number }>> {
  const map = new Map<string, { width: number; height: number }>()
  const list = originalDoc.getRoot().listTextures()
  for (let i = 0; i < list.length; i++) {
    const tex = list[i]
    const name = tex.getName() || tex.getURI() || `textura_${i}`
    const size = tex.getSize()
    const decoded = await imageBitmapFromTexture(tex)
    map.set(name, {
      width: decoded?.width || size?.[0] || 0,
      height: decoded?.height || size?.[1] || 0,
    })
  }
  return map
}

/**
 * Copia la imagen de una textura desde el documento original al de trabajo
 * (p. ej. devolver resolución original tras un resize) sin tocar el resto.
 */
export function restoreTextureImageFromOriginal(
  working: Document,
  original: Document,
  textureName: string,
): boolean {
  const origTex = findTextureByName(original, textureName)
  const workTex = findTextureByName(working, textureName)
  if (!origTex || !workTex) return false
  const image = origTex.getImage()
  if (!image) return false
  workTex.setImage(image.slice())
  workTex.setMimeType(origTex.getMimeType() || workTex.getMimeType() || 'image/png')
  return true
}

/**
 * Reintroduce una textura eliminada con la imagen/mime que tenía al borrarla
 * (resize/compresión incluidos) y reaplica los slots guardados en `usages`.
 * Si no hay snapshot, cae al documento original.
 */
export function restoreDeletedTexture(
  working: Document,
  snapshot: {
    name: string
    mimeType: string | null
    encodedImage?: Uint8Array | null
    usages: TextureUsage[]
  },
  original?: Document | null,
): boolean {
  let image = snapshot.encodedImage ? snapshot.encodedImage.slice() : null
  let mime = snapshot.mimeType || 'image/png'

  if (!image && original) {
    const origTex = findTextureByName(original, snapshot.name)
    const origImg = origTex?.getImage()
    if (origTex && origImg) {
      image = origImg.slice()
      mime = origTex.getMimeType() || mime
    }
  }
  if (!image) return false

  let workTex = findTextureByName(working, snapshot.name)
  if (!workTex) {
    workTex = working.createTexture(snapshot.name).setImage(image).setMimeType(mime)
  } else {
    workTex.setImage(image)
    workTex.setMimeType(mime)
  }

  const workMats = working.getRoot().listMaterials()
  if (snapshot.usages.length > 0) {
    for (const u of snapshot.usages) {
      const wm = workMats.find((m) => (m.getName() || '(sin nombre)') === u.materialName)
      if (!wm) continue
      setMaterialTextureBySlot(wm, u.slot, workTex)
    }
    return true
  }

  // Fallback: slots según el original
  if (original) {
    const origTex = findTextureByName(original, snapshot.name)
    if (origTex) {
      for (const om of original.getRoot().listMaterials()) {
        const wm = workMats.find((m) => m.getName() === om.getName())
        if (!wm) continue
        if (om.getBaseColorTexture() === origTex) wm.setBaseColorTexture(workTex)
        if (om.getMetallicRoughnessTexture() === origTex) wm.setMetallicRoughnessTexture(workTex)
        if (om.getNormalTexture() === origTex) wm.setNormalTexture(workTex)
        if (om.getOcclusionTexture() === origTex) wm.setOcclusionTexture(workTex)
        if (om.getEmissiveTexture() === origTex) wm.setEmissiveTexture(workTex)
      }
    }
  }
  return true
}

/** @deprecated Preferir restoreDeletedTexture con snapshot del working. */
export function restoreDeletedTextureFromOriginal(
  working: Document,
  original: Document,
  textureName: string,
): boolean {
  return restoreDeletedTexture(working, { name: textureName, mimeType: null, usages: [] }, original)
}
