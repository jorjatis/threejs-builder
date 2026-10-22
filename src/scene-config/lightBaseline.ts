import type { EditorLight, EditorLightBaseline, LightKind } from '../types'
import { createDefaultSceneConfig } from './defaults'

export function captureLightBaseline(light: EditorLight): EditorLightBaseline {
  return {
    // El original siempre es «encendida»; el switch de on/off no forma parte del reset.
    enabled: true,
    color: light.color,
    intensity: light.intensity,
    position: light.position ? ([...light.position] as [number, number, number]) : undefined,
    target: light.target ? ([...light.target] as [number, number, number]) : undefined,
    distance: light.distance,
    angle: light.angle,
    penumbra: light.penumbra,
    castShadow: light.castShadow,
  }
}

export function withLightBaseline(light: EditorLight): EditorLight {
  if (light.baseline) return light
  return { ...light, baseline: captureLightBaseline(light) }
}

function fallbackBaseline(kind: LightKind): EditorLightBaseline {
  if (kind === 'ambient') {
    return { enabled: true, color: '#ffffff', intensity: 0.45 }
  }
  if (kind === 'hemisphere') {
    return {
      enabled: true,
      color: '#ffffff',
      intensity: 0.55,
      position: [0, 1, 0],
    }
  }
  if (kind === 'point') {
    return {
      enabled: true,
      color: '#ffffff',
      intensity: 1.2,
      position: [3, 5, 3],
      distance: 0,
    }
  }
  if (kind === 'spot') {
    return {
      enabled: true,
      color: '#ffffff',
      intensity: 1.2,
      position: [3, 5, 3],
      target: [0, 0, 0],
      distance: 0,
      angle: Math.PI / 6,
      penumbra: 0.25,
    }
  }
  return {
    enabled: true,
    color: '#ffffff',
    intensity: 1.1,
    position: [5, 8, 5],
    target: [0, 0, 0],
    castShadow: false,
  }
}

/** Valores a aplicar al restablecer una luz. */
export function resolveLightReset(light: EditorLight): EditorLightBaseline {
  if (light.baseline) {
    return {
      ...light.baseline,
      position: light.baseline.position
        ? ([...light.baseline.position] as [number, number, number])
        : undefined,
      target: light.baseline.target
        ? ([...light.baseline.target] as [number, number, number])
        : undefined,
    }
  }
  const fromDefaults = createDefaultSceneConfig().lights.find((d) => d.id === light.id)
  if (fromDefaults) return captureLightBaseline(fromDefaults)
  return fallbackBaseline(light.kind)
}
