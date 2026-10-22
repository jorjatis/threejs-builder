import type { Document } from '@gltf-transform/core'
import JSZip from 'jszip'
import { writeDocumentToGlb, writeDocumentToGltfJson, readDocumentFromBuffer } from '../model/gltfIo'
import { downloadBlob } from '../utils/download'
import type { ExportFormat } from '../types'

export interface ModelExportResult {
  format: ExportFormat
  fileName: string
  sizeBytes: number
  blob: Blob
  valid: boolean
  validationMessage: string
}

export async function exportModelDocument(
  document: Document,
  format: ExportFormat,
  fileName: string,
): Promise<ModelExportResult> {
  const base = fileName.replace(/\.(glb|gltf|zip)$/i, '')

  if (format === 'glb') {
    const buffer = await writeDocumentToGlb(document)
    const valid = await validateGlb(buffer)
    const blob = new Blob([buffer], { type: 'model/gltf-binary' })
    return {
      format,
      fileName: `${base}.glb`,
      sizeBytes: buffer.byteLength,
      blob,
      valid: valid.ok,
      validationMessage: valid.message,
    }
  }

  const jsonDoc = await writeDocumentToGltfJson(document)
  const zip = new JSZip()
  zip.file(`${base}.gltf`, JSON.stringify(jsonDoc.json, null, 2))
  for (const [uri, data] of Object.entries(jsonDoc.resources)) {
    zip.file(uri, data)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  return {
    format,
    fileName: `${base}.zip`,
    sizeBytes: zipBlob.size,
    blob: zipBlob,
    valid: true,
    validationMessage: 'Paquete glTF + recursos generado.',
  }
}

export async function validateGlb(buffer: ArrayBuffer): Promise<{ ok: boolean; message: string }> {
  try {
    const doc = await readDocumentFromBuffer(buffer)
    const meshes = doc.getRoot().listMeshes().length
    return {
      ok: true,
      message: `GLB válido (${meshes} mallas). Puede reimportarse en el editor.`,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Validación fallida',
    }
  }
}

export function triggerDownload(result: ModelExportResult): void {
  downloadBlob(result.blob, result.fileName)
}
