/**
 * Estado mutable del modelo fuera de React (evita re-renders por buffers grandes).
 */
import type { Document } from '@gltf-transform/core'
import type { TextureInfo } from '../types'

export interface ModelSession {
  fileName: string
  format: 'glb' | 'gltf'
  originalGlb: ArrayBuffer
  originalSizeBytes: number
  workingGlb: ArrayBuffer
  /** Última versión exportable válida (optimizada o de trabajo) */
  lastValidGlb: ArrayBuffer
  document: Document | null
  companionFiles: string[]
  /** Texturas eliminadas recuperables: id → imagen + metadatos */
  removedTextures: Map<string, TextureInfo>
}

let session: ModelSession | null = null

export function getModelSession(): ModelSession | null {
  return session
}

export function setModelSession(next: ModelSession | null): void {
  session = next
}

export function updateWorkingGlb(glb: ArrayBuffer, document: Document): void {
  if (!session) return
  session.workingGlb = glb
  session.lastValidGlb = glb
  session.document = document
}
