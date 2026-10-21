import type { Document } from '@gltf-transform/core'
import {
  readDocumentFromBuffer,
  readDocumentFromGltfBundle,
  writeDocumentToGlb,
} from './gltfIo'
import { inspectDocument } from './inspectModel'
import type { ModelStats } from '../types'

export interface ImportedModel {
  fileName: string
  format: 'glb' | 'gltf'
  /** Buffer original intacto */
  originalGlb: ArrayBuffer
  originalSizeBytes: number
  /** Documento de trabajo (copia) */
  workingGlb: ArrayBuffer
  document: Document
  stats: ModelStats
  companionFiles: string[]
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function basename(path: string): string {
  const n = normalizePath(path)
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(i + 1) : n
}

function dirname(path: string): string {
  const n = normalizePath(path)
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(0, i) : ''
}

function joinPath(dir: string, rel: string): string {
  const cleanRel = normalizePath(rel)
  if (!dir) return cleanRel
  const parts = [...dir.split('/'), ...cleanRel.split('/')]
  const out: string[] = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

async function fileToUint8(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Importa uno o varios archivos .glb / .gltf (+ recursos asociados).
 * Para .gltf con recursos externos, pasa todos los archivos del conjunto.
 */
export async function importModelFiles(files: FileList | File[]): Promise<ImportedModel> {
  const list = [...files]
  if (list.length === 0) {
    throw new ImportError('No se seleccionó ningún archivo.')
  }

  const byName = new Map<string, File>()
  for (const f of list) {
    const key = normalizePath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
    byName.set(key, f)
    byName.set(basename(key), f)
  }

  const glbFile = list.find((f) => f.name.toLowerCase().endsWith('.glb'))
  const gltfFile = list.find((f) => f.name.toLowerCase().endsWith('.gltf'))

  if (glbFile && !gltfFile) {
    return importGlb(glbFile)
  }

  if (gltfFile) {
    return importGltf(gltfFile, byName, list)
  }

  throw new ImportError(
    'Formato no compatible. Usa un archivo .glb o .gltf (con sus recursos asociados).',
  )
}

async function importGlb(file: File): Promise<ImportedModel> {
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength < 12) {
    throw new ImportError('El archivo GLB está vacío o corrupto.')
  }

  let document: Document
  try {
    document = await readDocumentFromBuffer(buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new ImportError(`No se pudo leer el GLB: ${msg}`)
  }

  const stats = inspectDocument(document, {
    fileName: file.name,
    fileSizeBytes: buffer.byteLength,
    format: 'glb',
  })

  // workingGlb es copia del original al importar
  const workingGlb = buffer.slice(0)

  return {
    fileName: file.name,
    format: 'glb',
    originalGlb: buffer,
    originalSizeBytes: buffer.byteLength,
    workingGlb,
    document,
    stats,
    companionFiles: [],
  }
}

async function importGltf(
  entry: File,
  byName: Map<string, File>,
  allFiles: File[],
): Promise<ImportedModel> {
  const entryPath =
    normalizePath((entry as File & { webkitRelativePath?: string }).webkitRelativePath || entry.name)
  const entryDir = dirname(entryPath)
  const jsonText = await entry.text()

  let json: Record<string, unknown>
  try {
    json = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    throw new ImportError('El archivo .gltf no contiene JSON válido.')
  }

  const neededUris = collectExternalUris(json)
  const resources: Record<string, Uint8Array> = {}
  const missing: string[] = []
  const companionFiles: string[] = []

  for (const uri of neededUris) {
    if (uri.startsWith('data:')) continue
    const resolved = joinPath(entryDir, uri)
    const file =
      byName.get(resolved) ||
      byName.get(uri) ||
      byName.get(basename(uri)) ||
      allFiles.find((f) => basename(f.name) === basename(uri))

    if (!file) {
      missing.push(uri)
      continue
    }
    resources[uri] = await fileToUint8(file)
    companionFiles.push(file.name)
  }

  if (missing.length > 0) {
    throw new ImportError(
      `Faltan recursos externos referenciados por el .gltf: ${missing.join(', ')}. ` +
        'Selecciona o arrastra también las imágenes y buffers asociados.',
    )
  }

  let document: Document
  try {
    document = await readDocumentFromGltfBundle(json, resources)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new ImportError(`No se pudo leer el glTF: ${msg}`)
  }

  // Empaqueta a GLB como representación de trabajo unificada
  let workingGlb: ArrayBuffer
  try {
    workingGlb = await writeDocumentToGlb(document)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new ImportError(`No se pudo empaquetar el glTF a GLB de trabajo: ${msg}`)
  }

  const originalSize = entry.size + companionFiles.reduce((acc, name) => {
    const f = allFiles.find((x) => x.name === name)
    return acc + (f?.size ?? 0)
  }, 0)

  const stats = inspectDocument(document, {
    fileName: entry.name,
    fileSizeBytes: originalSize,
    format: 'gltf',
  })

  return {
    fileName: entry.name,
    format: 'gltf',
    originalGlb: workingGlb.slice(0),
    originalSizeBytes: originalSize,
    workingGlb,
    document,
    stats,
    companionFiles,
  }
}

function collectExternalUris(json: Record<string, unknown>): string[] {
  const uris: string[] = []
  const buffers = json.buffers as Array<{ uri?: string }> | undefined
  const images = json.images as Array<{ uri?: string }> | undefined
  for (const b of buffers ?? []) {
    if (b.uri && !b.uri.startsWith('data:')) uris.push(b.uri)
  }
  for (const img of images ?? []) {
    if (img.uri && !img.uri.startsWith('data:')) uris.push(img.uri)
  }
  return [...new Set(uris)]
}

export function isModelFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return n.endsWith('.glb') || n.endsWith('.gltf')
}

export function filterImportableFiles(files: FileList | File[]): File[] {
  const list = [...files]
  const hasGltf = list.some((f) => f.name.toLowerCase().endsWith('.gltf'))
  if (hasGltf) {
    // Incluye recursos asociados típicos
    return list.filter((f) => {
      const n = f.name.toLowerCase()
      return (
        n.endsWith('.gltf') ||
        n.endsWith('.glb') ||
        n.endsWith('.bin') ||
        n.endsWith('.png') ||
        n.endsWith('.jpg') ||
        n.endsWith('.jpeg') ||
        n.endsWith('.webp') ||
        n.endsWith('.ktx2') ||
        n.endsWith('.basis')
      )
    })
  }
  return list.filter((f) => f.name.toLowerCase().endsWith('.glb'))
}
