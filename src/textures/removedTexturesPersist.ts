import type { TextureInfo } from '../types'

/** Forma serializable (IndexedDB / ZIP) de una textura eliminada recuperable. */
export type StoredRemovedTexture = Omit<TextureInfo, 'sourceImageData' | 'active'> & {
  active: false
  sourceImageData: null
  /** En ZIP portable se guarda como base64; en IDB como Uint8Array. */
  encodedImage: Uint8Array | null
  encodedImageBase64?: string | null
}

export function serializeRemovedTextures(
  map: Map<string, TextureInfo>,
): StoredRemovedTexture[] {
  return [...map.values()].map((t) => {
    const encoded =
      t.encodedImage == null
        ? null
        : t.encodedImage instanceof Uint8Array
          ? t.encodedImage.slice()
          : new Uint8Array(t.encodedImage)
    return {
      id: t.id,
      name: t.name,
      uuid: t.uuid,
      width: t.width,
      height: t.height,
      originalWidth: t.originalWidth,
      originalHeight: t.originalHeight,
      format: t.format,
      mimeType: t.mimeType,
      sizeBytes: t.sizeBytes,
      sizeConfidence: t.sizeConfidence,
      roles: [...t.roles],
      usages: t.usages.map((u) => ({ ...u, objectNames: [...u.objectNames] })),
      active: false as const,
      thumbnailDataUrl: t.thumbnailDataUrl,
      sourceImageData: null,
      encodedImage: encoded,
    }
  })
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    s += String.fromCharCode.apply(null, slice as unknown as number[])
  }
  return btoa(s)
}

/** Para JSON del ZIP portable (Uint8Array no sobrevive a JSON.stringify). */
export function serializeRemovedTexturesForJson(
  map: Map<string, TextureInfo>,
): StoredRemovedTexture[] {
  return serializeRemovedTextures(map).map((t) => ({
    ...t,
    encodedImage: null,
    encodedImageBase64: t.encodedImage ? bytesToBase64(t.encodedImage) : null,
  }))
}

export function restoreRemovedTexturesMap(
  list: StoredRemovedTexture[] | undefined | null,
): Map<string, TextureInfo> {
  const map = new Map<string, TextureInfo>()
  if (!list?.length) return map
  for (const t of list) {
    let encoded: Uint8Array | null = null
    if (t.encodedImage instanceof Uint8Array) {
      encoded = t.encodedImage
    } else if (t.encodedImage && typeof t.encodedImage === 'object') {
      encoded = new Uint8Array(t.encodedImage as ArrayLike<number>)
    } else if (t.encodedImageBase64) {
      encoded = bytesFromBase64(t.encodedImageBase64)
    }
    map.set(t.id, {
      id: t.id,
      name: t.name,
      uuid: t.uuid,
      width: t.width,
      height: t.height,
      originalWidth: t.originalWidth,
      originalHeight: t.originalHeight,
      format: t.format,
      mimeType: t.mimeType,
      sizeBytes: t.sizeBytes,
      sizeConfidence: t.sizeConfidence,
      roles: t.roles ?? [],
      usages: t.usages ?? [],
      active: false,
      thumbnailDataUrl: t.thumbnailDataUrl ?? null,
      sourceImageData: null,
      encodedImage: encoded,
    })
  }
  return map
}

/** Activas del GLB + eliminadas recuperables (sin duplicar por nombre). */
export function mergeActiveAndRemovedTextures(
  activeFromGlb: TextureInfo[],
  removed: Map<string, TextureInfo>,
): TextureInfo[] {
  const active = activeFromGlb.map((t) => ({ ...t, active: true as const }))
  const activeNames = new Set(active.map((t) => t.name))
  const removedOnly = [...removed.values()]
    .filter((t) => !activeNames.has(t.name))
    .map((t) => ({ ...t, active: false as const }))
  return [...active, ...removedOnly]
}
