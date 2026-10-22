import { WebIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

let ioPromise: Promise<WebIO> | null = null
let dracoReady: boolean | null = null

type DracoFactory = (config?: {
  locateFile?: (path: string, prefix?: string) => string
}) => Promise<object> | object

function dracoBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}draco/`
}

function loadScriptOnce(src: string, globalName: string): Promise<DracoFactory> {
  const existing = (window as unknown as Record<string, unknown>)[globalName]
  if (typeof existing === 'function') {
    return Promise.resolve(existing as DracoFactory)
  }
  return new Promise((resolve, reject) => {
    const prev = document.querySelector<HTMLScriptElement>(`script[data-draco="${globalName}"]`)
    if (prev) {
      prev.addEventListener('load', () => {
        const factory = (window as unknown as Record<string, unknown>)[globalName]
        if (typeof factory === 'function') resolve(factory as DracoFactory)
        else reject(new Error(`No se cargó ${globalName}`))
      })
      prev.addEventListener('error', () => reject(new Error(`Error al cargar ${src}`)))
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.draco = globalName
    script.onload = () => {
      const factory = (window as unknown as Record<string, unknown>)[globalName]
      if (typeof factory === 'function') resolve(factory as DracoFactory)
      else reject(new Error(`No se cargó ${globalName}`))
    }
    script.onerror = () => reject(new Error(`Error al cargar ${src}`))
    document.head.appendChild(script)
  })
}

async function createDracoModule(scriptName: string, globalName: string): Promise<object> {
  const base = dracoBaseUrl()
  const factory = await loadScriptOnce(`${base}${scriptName}`, globalName)
  const moduleOrPromise = factory({
    locateFile: (path: string) => `${base}${path}`,
  })
  const mod = await Promise.resolve(moduleOrPromise)
  const withReady = mod as { ready?: Promise<object> }
  if (withReady.ready) return withReady.ready
  return mod
}

/** True si el encoder/decoder Draco WASM del navegador está registrado en WebIO. */
export function isDracoTransformAvailable(): boolean {
  return dracoReady === true
}

/**
 * WebIO con Meshopt + Draco (WASM en public/draco/).
 * El encoder npm `draco3dgltf` es Node-only; aquí usamos los builds oficiales de Google.
 */
export async function getGltfIO(): Promise<WebIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      await MeshoptDecoder.ready
      await MeshoptEncoder.ready

      const deps: Record<string, unknown> = {
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      }

      try {
        const [encoder, decoder] = await Promise.all([
          createDracoModule('draco_encoder.js', 'DracoEncoderModule'),
          createDracoModule('draco_decoder_gltf.js', 'DracoDecoderModule'),
        ])
        deps['draco3d.encoder'] = encoder
        deps['draco3d.decoder'] = decoder
        dracoReady = true
      } catch (err) {
        console.warn('[gltfIo] Draco WASM no disponible; Meshopt sigue activo.', err)
        dracoReady = false
      }

      return new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(deps)
    })()
  }
  return ioPromise
}

export async function readDocumentFromBuffer(buffer: ArrayBuffer): Promise<Document> {
  const io = await getGltfIO()
  try {
    return await io.readBinary(new Uint8Array(buffer))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/draco/i.test(msg) && !isDracoTransformAvailable()) {
      throw new Error(
        'Este archivo usa Draco y el decoder WASM no pudo cargarse. Recarga la página o comprueba public/draco/. Detalle: ' +
          msg,
      )
    }
    throw err
  }
}

export async function readDocumentFromGltfBundle(
  entryJson: object,
  resources: Record<string, Uint8Array>,
): Promise<Document> {
  const io = await getGltfIO()
  const normalized: Record<string, Uint8Array<ArrayBuffer>> = {}
  for (const [key, value] of Object.entries(resources)) {
    normalized[key] = new Uint8Array(value) as Uint8Array<ArrayBuffer>
  }
  return io.readJSON({ json: entryJson as never, resources: normalized })
}

export async function writeDocumentToGlb(document: Document): Promise<ArrayBuffer> {
  const io = await getGltfIO()
  const bytes = await io.writeBinary(document)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function writeDocumentToGltfJson(document: Document) {
  const io = await getGltfIO()
  return io.writeJSON(document)
}

export async function cloneDocumentFromGlb(glb: ArrayBuffer): Promise<Document> {
  return readDocumentFromBuffer(glb)
}

export { MeshoptEncoder, MeshoptDecoder }
