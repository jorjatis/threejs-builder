import type { Document, Node } from '@gltf-transform/core'
import { Light as GltfLight } from '@gltf-transform/extensions'
import type { EditorLight, LightKind } from '../types'
import { createId } from '../utils/id'
import { withLightBaseline } from '../scene-config/lightBaseline'

function linearRgbToHex(rgb: [number, number, number]): string {
  const toSrgb = (c: number) => {
    const x = Math.min(1, Math.max(0, c))
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  }
  const hex = (n: number) =>
    Math.round(toSrgb(n) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** Posición y dirección (-Z local) desde la matriz mundo de un nodo glTF. */
function poseFromWorldMatrix(mat: number[]): {
  position: [number, number, number]
  direction: [number, number, number]
} {
  const position: [number, number, number] = [mat[12], mat[13], mat[14]]
  // Columna Z de la rotación (índices 8,9,10); la luz punctual apunta a -Z.
  const direction = normalize([-mat[8], -mat[9], -mat[10]])
  return { position, direction }
}

function kindLabel(kind: LightKind): string {
  if (kind === 'directional') return 'Direccional'
  if (kind === 'point') return 'Puntual'
  if (kind === 'spot') return 'Foco'
  return kind
}

/**
 * Extrae luces KHR_lights_punctual del documento a luces del editor (`source: 'imported'`).
 */
export function extractPunctualLights(document: Document): EditorLight[] {
  const out: EditorLight[] = []
  const root = document.getRoot()

  const visit = (node: Node) => {
    const ext = node.getExtension('KHR_lights_punctual')
    if (!(ext instanceof GltfLight)) return

    const type = ext.getType()
    const kind: LightKind =
      type === 'directional' ? 'directional' : type === 'spot' ? 'spot' : 'point'
    const color = ext.getColor() as [number, number, number]
    const { position, direction } = poseFromWorldMatrix(node.getWorldMatrix())
    const target: [number, number, number] = [
      position[0] + direction[0],
      position[1] + direction[1],
      position[2] + direction[2],
    ]
    const range = ext.getRange()
    const name = node.getName()?.trim() || `${kindLabel(kind)} (GLB)`

    const light: EditorLight = {
      id: createId('imported_light'),
      kind,
      name,
      enabled: true,
      color: linearRgbToHex(color),
      intensity: ext.getIntensity(),
      position,
      source: 'imported',
    }

    if (kind === 'directional' || kind === 'spot') {
      light.target = target
    }
    if (kind === 'point' || kind === 'spot') {
      light.distance = range != null && range > 0 ? range : 0
    }
    if (kind === 'spot') {
      const outer = ext.getOuterConeAngle()
      const inner = ext.getInnerConeAngle()
      light.angle = outer
      light.penumbra = outer > 1e-6 ? Math.min(1, Math.max(0, 1 - inner / outer)) : 0
    }

    out.push(withLightBaseline(light))
  }

  for (const node of root.listNodes()) {
    visit(node)
  }
  return out
}

/** Sustituye luces importadas anteriores; conserva las del editor. */
export function mergeImportedLights(
  current: EditorLight[],
  extracted: EditorLight[],
): EditorLight[] {
  const editorKept = current.filter((l) => l.source === 'editor')
  return [...editorKept, ...extracted]
}
