/**
 * Worker: pipeline glTF (geometría / meshopt) fuera del hilo principal.
 * Texturas y Draco se ejecutan en el main (canvas / WASM con scripts DOM).
 */
import { WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { runPipelineOnDocument } from '../operations'
import type { OptimizationOpId, OptimizationSettings, PipelineStep } from '../../types'
import type { OpContext } from '../operations'

export interface WorkerPipelineRequest {
  type: 'run'
  id: string
  glb: ArrayBuffer
  steps: PipelineStep[]
  settings: Pick<
    OptimizationSettings,
    'maxTextureSize' | 'simplifyRatio' | 'simplifyError' | 'textureFormat'
  >
}

export type WorkerPipelineResponse =
  | { type: 'ok'; id: string; glb: ArrayBuffer }
  | { type: 'error'; id: string; message: string }
  | { type: 'log'; id: string; level: string; message: string; details?: string }
  | { type: 'progress'; id: string; op: OptimizationOpId }

let ioPromise: Promise<WebIO> | null = null

async function getWorkerIO(): Promise<WebIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      await MeshoptDecoder.ready
      await MeshoptEncoder.ready
      return new WebIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'meshopt.decoder': MeshoptDecoder,
          'meshopt.encoder': MeshoptEncoder,
        })
    })()
  }
  return ioPromise
}

self.onmessage = async (ev: MessageEvent<WorkerPipelineRequest>) => {
  const msg = ev.data
  if (!msg || msg.type !== 'run') return
  const { id, glb, steps, settings } = msg

  const post = (data: WorkerPipelineResponse, transfer?: Transferable[]) => {
    ;(self as unknown as Worker).postMessage(data, transfer ?? [])
  }

  try {
    const io = await getWorkerIO()
    const document = await io.readBinary(new Uint8Array(glb))

    const ctx: OpContext = {
      maxTextureSize: settings.maxTextureSize,
      simplifyRatio: settings.simplifyRatio,
      simplifyError: settings.simplifyError,
      textureFormat: settings.textureFormat,
      onLog: (level, message, details) => {
        post({ type: 'log', id, level, message, details })
      },
    }

    await runPipelineOnDocument(document, steps, ctx)

    const bytes = await io.writeBinary(document)
    const out = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    post({ type: 'ok', id, glb: out }, [out])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', id, message })
  }
}
