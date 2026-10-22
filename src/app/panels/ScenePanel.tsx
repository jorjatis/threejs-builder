import { useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import {
  Section,
  Collapse,
  Field,
  NumberInput,
  SliderInput,
  Select,
  Switch,
  ColorInput,
  InfoTip,
} from '../../components/ui'
import { getViewerService } from '../../viewer/ViewerService'
import { createDefaultSceneConfig } from '../../scene-config/defaults'
import {
  resolveLightReset,
  withLightBaseline,
} from '../../scene-config/lightBaseline'
import { extractPunctualLights, mergeImportedLights } from '../../model/extractLights'
import { getModelSession } from '../../store/modelSession'
import type { EditorLight, LightKind } from '../../types'
import { createId } from '../../utils/id'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

const LIGHT_KIND_LABEL: Record<LightKind, string> = {
  ambient: 'Ambiental',
  hemisphere: 'Hemisférica',
  directional: 'Direccional',
  point: 'Puntual',
  spot: 'Foco',
}

/** Posiciones por defecto distintas para no apilar luces nuevas en el mismo sitio. */
const LIGHT_POSITION_PRESETS: [number, number, number][] = [
  [5, 8, 5],
  [-5, 6, 4],
  [4, 5, -6],
  [-4, 7, -5],
  [0, 10, 2],
  [6, 3, 0],
  [-6, 4, 1],
  [2, 9, -4],
]

function lightNeedsPosition(kind: LightKind): boolean {
  return kind !== 'ambient'
}

function lightNeedsTarget(kind: LightKind): boolean {
  return kind === 'directional' || kind === 'spot'
}

function vecDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Acerca/aleja la luz respecto a un ancla (mira o origen), manteniendo la dirección. */
function setDistanceFromAnchor(
  pos: [number, number, number],
  anchor: [number, number, number],
  dist: number,
): [number, number, number] {
  const dx = pos[0] - anchor[0]
  const dy = pos[1] - anchor[1]
  const dz = pos[2] - anchor[2]
  const len = Math.hypot(dx, dy, dz)
  const d = Math.max(0.01, dist)
  if (len < 1e-6) {
    return [anchor[0], anchor[1] + d, anchor[2]]
  }
  const s = d / len
  return [anchor[0] + dx * s, anchor[1] + dy * s, anchor[2] + dz * s]
}

function Vec3Sliders({
  value,
  onChange,
  min = -25,
  max = 25,
  step = 0.1,
}: {
  value: [number, number, number]
  onChange: (next: [number, number, number]) => void
  min?: number
  max?: number
  step?: number
}) {
  const lo = Math.min(min, ...value.map((v) => v - 2))
  const hi = Math.max(max, ...value.map((v) => v + 2))
  return (
    <div className="light-card__xyz light-card__xyz--sliders">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <div key={axis} className="light-card__xyz-axis">
          <span className="light-card__xyz-label">{axis}</span>
          <SliderInput
            value={value[i]}
            min={lo}
            max={hi}
            step={step}
            onChange={(v) => {
              const next = [...value] as [number, number, number]
              next[i] = v
              onChange(next)
            }}
          />
        </div>
      ))}
    </div>
  )
}

export function ScenePanel() {
  const scene = useAppStore((s) => s.scene)
  const setScene = useAppStore((s) => s.setScene)
  const syncCameraFromViewer = useAppStore((s) => s.syncCameraFromViewer)
  const setToast = useAppStore((s) => s.setToast)
  const hasModel = useAppStore((s) => s.hasModel)
  const scenePresets = useAppStore((s) => s.scenePresets)
  const activePresetId = useAppStore((s) => s.activePresetId)
  const setActivePresetId = useAppStore((s) => s.setActivePresetId)
  const [showLightHelpers, setShowLightHelpers] = useState(() =>
    getViewerService().getShowLightHelpers(),
  )

  useEffect(() => {
    syncCameraFromViewer()
  }, [syncCameraFromViewer])

  const azLimited =
    Number.isFinite(scene.camera.minAzimuthAngle) && Number.isFinite(scene.camera.maxAzimuthAngle)

  function addLight(kind: LightKind) {
    const sameKind = scene.lights.filter((l) => l.kind === kind).length
    const position = LIGHT_POSITION_PRESETS[sameKind % LIGHT_POSITION_PRESETS.length]
    const intensity =
      kind === 'ambient'
        ? 0.45
        : kind === 'hemisphere'
          ? 0.55
          : kind === 'point' || kind === 'spot'
            ? 1.2
            : 1
    const light = withLightBaseline({
      id: createId('light'),
      kind,
      name:
        sameKind === 0 ? LIGHT_KIND_LABEL[kind] : `${LIGHT_KIND_LABEL[kind]} ${sameKind + 1}`,
      enabled: true,
      color: '#ffffff',
      intensity,
      ...(lightNeedsPosition(kind)
        ? {
            position:
              kind === 'hemisphere' ? ([0, 1, 0] as [number, number, number]) : position,
          }
        : {}),
      ...(lightNeedsTarget(kind) ? { target: [0, 0, 0] as [number, number, number] } : {}),
      ...(kind === 'point' || kind === 'spot' ? { distance: 0 } : {}),
      ...(kind === 'spot' ? { angle: Math.PI / 6, penumbra: 0.25 } : {}),
      source: 'editor',
    })
    setScene({ lights: [...scene.lights, light] })
  }

  function updateLight(id: string, partial: Partial<EditorLight>) {
    setScene({
      lights: scene.lights.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, ...partial }
        return next.baseline ? next : withLightBaseline(next)
      }),
    })
  }

  function resetLight(id: string) {
    const light = scene.lights.find((l) => l.id === id)
    if (!light) return
    const reset = resolveLightReset(light)
    // No tocar enabled: el ↺ restaura color/posición/etc., no enciende ni apaga.
    const { enabled: _en, ...rest } = reset
    updateLight(id, {
      ...rest,
      enabled: light.enabled,
      baseline: light.baseline ?? { ...reset, enabled: true },
    })
  }

  /** Encuadre ¾ centrado en el modelo (como «Encuadrar modelo»), no el [0,1.5,4] fijo. */
  function applyDefaultFraming() {
    if (!hasModel) return
    getViewerService().fitCameraToModel()
    syncCameraFromViewer()
    getViewerService().rememberCamera()
  }

  /** Restaura FOV/límites/speeds y vuelve al encuadre por defecto del modelo. */
  function resetCameraSettings() {
    const def = createDefaultSceneConfig().camera
    const live = getViewerService().captureCameraState()
    setScene({
      camera: {
        ...def,
        position: live.position,
        target: live.target,
      },
    })
    applyDefaultFraming()
  }

  function patchCamera(partial: Partial<typeof scene.camera>) {
    // Solo el parcial: si se manda toda la cámara, el store cree que position/target
    // cambiaron y reposiciona el visor (Near/Far/velocidades no deben mover nada).
    setScene({ camera: partial })
  }

  function resetCameraField<K extends keyof typeof scene.camera>(key: K) {
    if (key === 'position' || key === 'target') {
      applyDefaultFraming()
      return
    }
    const def = createDefaultSceneConfig().camera
    patchCamera({ [key]: def[key] } as Partial<typeof scene.camera>)
  }

  function updateModelVec(
    key: 'modelPosition' | 'modelRotation',
    axis: 0 | 1 | 2,
    value: number,
  ) {
    const current = [...scene[key]] as [number, number, number]
    current[axis] = value
    setScene({ [key]: current })
  }

  function reimportLightsFromModel() {
    const session = getModelSession()
    if (!session?.document) {
      setToast('No hay modelo cargado.')
      return
    }
    const extracted = extractPunctualLights(session.document)
    setScene({ lights: mergeImportedLights(scene.lights, extracted) })
    setToast(
      extracted.length > 0
        ? `Importadas ${extracted.length} luz(ces) del GLB.`
        : 'Este modelo no trae luces KHR_lights_punctual.',
    )
    window.setTimeout(() => {
      const msg = useAppStore.getState().toastMessage
      if (msg?.startsWith('Importadas') || msg?.startsWith('Este modelo')) {
        useAppStore.getState().setToast(null)
      }
    }, 3500)
  }

  function onToggleLightHelpers(v: boolean) {
    setShowLightHelpers(v)
    getViewerService().setShowLightHelpers(v)
    getViewerService().syncEditorLights(useAppStore.getState().scene.lights)
  }

  function resetSceneConfig() {
    const def = createDefaultSceneConfig()
    const liveCam = getViewerService().captureCameraState()
    const next = {
      ...def,
      camera: { ...def.camera, position: liveCam.position, target: liveCam.target },
      modelScale: scene.modelScale,
      modelPosition: scene.modelPosition,
      modelRotation: scene.modelRotation,
    }
    useAppStore.setState({
      scene: next,
      activePresetId: null,
      saveState: { ...useAppStore.getState().saveState, dirty: true },
    })
    getViewerService().applySceneConfig(next, { moveCamera: false })
  }

  function applyScenePreset(presetId: string) {
    const preset = scenePresets.find((p) => p.id === presetId)
    if (!preset) return
    const cfg = preset.config
    const cameraRest = cfg.camera
      ? (() => {
          const { position: _p, target: _t, ...rest } = cfg.camera
          return rest
        })()
      : undefined

    setScene({
      ...(cameraRest ? { camera: cameraRest } : {}),
      ...(cfg.interaction ? { interaction: cfg.interaction } : {}),
      ...(cfg.autoRotate ? { autoRotate: cfg.autoRotate } : {}),
      ...(cfg.environment ? { environment: cfg.environment } : {}),
    })
    setActivePresetId(preset.id)
    if (cfg.camera && hasModel) {
      applyDefaultFraming()
    }
    setToast(`Preset «${preset.name}» aplicado.`)
    window.setTimeout(() => {
      if (useAppStore.getState().toastMessage?.startsWith('Preset «')) {
        useAppStore.getState().setToast(null)
      }
    }, 2800)
  }

  return (
    <>
      <div className="tools-panel__header">
        <h1>Escena</h1>
      </div>
      <div className="tools-panel__body">
        {!hasModel && <p className="muted">Puedes ajustar la escena sin modelo cargado.</p>}

        <Section title="Configuración">
          <button type="button" className="btn btn--block" onClick={resetSceneConfig}>
            Restablecer configuración
          </button>
        </Section>

        <Collapse title="Presets" defaultOpen={false}>
          <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
            Atajos de cámara, interacción y auto-rotación. El encuadre se adapta al modelo.
          </p>
          <div className="preset-list">
            {scenePresets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-item${activePresetId === p.id ? ' preset-item--active' : ''}`}
                onClick={() => applyScenePreset(p.id)}
              >
                <strong>{p.name}</strong>
                <span className="dim">{p.description}</span>
              </button>
            ))}
          </div>
        </Collapse>

        <Collapse title="Cámara" defaultOpen>
          <Field label="Tipo" onReset={() => resetCameraField('type')}>
            <Select
              value={scene.camera.type}
              onChange={(e) =>
                patchCamera({
                  type: e.target.value as 'perspective' | 'orthographic',
                })
              }
            >
              <option value="perspective">Perspectiva</option>
              <option value="orthographic">Ortográfica</option>
            </Select>
          </Field>
          <Field label="FOV" onReset={() => resetCameraField('fov')}>
            <SliderInput
              value={scene.camera.fov}
              min={10}
              max={120}
              step={1}
              onChange={(v) => patchCamera({ fov: v })}
            />
          </Field>
          <Field
            label="Posición"
            tip="Posición de la cámara. El ↺ vuelve al encuadre ¾ del modelo (no a 0, 1.5, 4)."
            onReset={() => resetCameraField('position')}
          >
            <Vec3Sliders
              value={scene.camera.position}
              onChange={(next) => patchCamera({ position: next })}
            />
          </Field>
          <Field
            label="Mira hacia"
            tip="Punto al que mira la cámara. El ↺ recentra el encuadre en el modelo."
            onReset={() => resetCameraField('target')}
          >
            <Vec3Sliders
              value={scene.camera.target}
              onChange={(next) => patchCamera({ target: next })}
            />
          </Field>
          <Field
            label="Distancia mín"
            onReset={() => {
              const def = createDefaultSceneConfig().camera
              const minDistance = def.minDistance
              patchCamera({
                minDistance,
                maxDistance: Math.max(minDistance, scene.camera.maxDistance),
              })
            }}
          >
            <SliderInput
              value={scene.camera.minDistance}
              min={0.01}
              max={Math.max(20, scene.camera.maxDistance)}
              step={0.1}
              onChange={(v) => {
                const minDistance = Math.max(0.01, v)
                patchCamera({
                  minDistance,
                  maxDistance: Math.max(minDistance, scene.camera.maxDistance),
                })
              }}
            />
          </Field>
          <Field label="Distancia máx" onReset={() => resetCameraField('maxDistance')}>
            <SliderInput
              value={scene.camera.maxDistance}
              min={Math.max(0.01, scene.camera.minDistance)}
              max={Math.max(50, scene.camera.maxDistance + 5)}
              step={0.1}
              onChange={(v) => {
                patchCamera({ maxDistance: Math.max(scene.camera.minDistance, v) })
              }}
            />
          </Field>
          <Field
            label="Polar mín (°)"
            tip="Ángulo vertical inferior. 0° = desde arriba, 90° = horizonte, 180° = desde abajo."
            onReset={() => resetCameraField('minPolarAngle')}
          >
            <SliderInput
              value={round1(scene.camera.minPolarAngle * RAD2DEG)}
              min={0}
              max={180}
              step={1}
              onChange={(minDeg) => {
                const clamped = Math.min(180, Math.max(0, minDeg))
                const maxDeg = Math.max(clamped, round1(scene.camera.maxPolarAngle * RAD2DEG))
                patchCamera({
                  minPolarAngle: clamped * DEG2RAD,
                  maxPolarAngle: maxDeg * DEG2RAD,
                })
              }}
            />
          </Field>
          <Field label="Polar máx (°)" onReset={() => resetCameraField('maxPolarAngle')}>
            <SliderInput
              value={round1(scene.camera.maxPolarAngle * RAD2DEG)}
              min={0}
              max={180}
              step={1}
              onChange={(maxDeg) => {
                const clamped = Math.min(180, Math.max(0, maxDeg))
                const minDeg = Math.min(clamped, round1(scene.camera.minPolarAngle * RAD2DEG))
                patchCamera({
                  minPolarAngle: minDeg * DEG2RAD,
                  maxPolarAngle: clamped * DEG2RAD,
                })
              }}
            />
          </Field>
          <div className="switch-row">
            <Switch
              checked={azLimited}
              onChange={(v) => {
                if (v) {
                  patchCamera({
                    minAzimuthAngle: -Math.PI,
                    maxAzimuthAngle: Math.PI,
                  })
                } else {
                  patchCamera({
                    minAzimuthAngle: -Infinity,
                    maxAzimuthAngle: Infinity,
                  })
                }
              }}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">
                Limitar azimuth
                <InfoTip text="Restringe el giro horizontal. Útil en embeds donde solo quieres un arco de vista." />
              </div>
            </div>
          </div>
          {azLimited && (
            <>
              <Field
                label="Azimuth mín (°)"
                tip="Giro horizontal. Ej. −45 a 45 para un semicírculo estrecho."
                onReset={() => resetCameraField('minAzimuthAngle')}
              >
                <SliderInput
                  value={round1(scene.camera.minAzimuthAngle * RAD2DEG)}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(minDeg) => {
                    const clamped = Math.min(180, Math.max(-180, minDeg))
                    const maxDeg = Math.max(
                      clamped,
                      round1(scene.camera.maxAzimuthAngle * RAD2DEG),
                    )
                    patchCamera({
                      minAzimuthAngle: clamped * DEG2RAD,
                      maxAzimuthAngle: maxDeg * DEG2RAD,
                    })
                  }}
                />
              </Field>
              <Field label="Azimuth máx (°)" onReset={() => resetCameraField('maxAzimuthAngle')}>
                <SliderInput
                  value={round1(scene.camera.maxAzimuthAngle * RAD2DEG)}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(maxDeg) => {
                    const clamped = Math.min(180, Math.max(-180, maxDeg))
                    const minDeg = Math.min(
                      clamped,
                      round1(scene.camera.minAzimuthAngle * RAD2DEG),
                    )
                    patchCamera({
                      minAzimuthAngle: minDeg * DEG2RAD,
                      maxAzimuthAngle: clamped * DEG2RAD,
                    })
                  }}
                />
              </Field>
            </>
          )}
          <div className="camera-actions">
            <button
              type="button"
              className="btn"
              title="Marca esta vista como la de «Restablecer cámara» en el visor"
              disabled={!hasModel}
              onClick={() => {
                getViewerService().rememberCamera()
                syncCameraFromViewer()
                setToast(
                  'Encuadre guardado. El botón ↺ del visor volverá a esta vista.',
                )
                window.setTimeout(() => {
                  if (
                    useAppStore.getState().toastMessage?.startsWith('Encuadre guardado')
                  ) {
                    useAppStore.getState().setToast(null)
                  }
                }, 3200)
              }}
            >
              Guardar encuadre
            </button>
            <button
              type="button"
              className="btn"
              title="Centra la cámara en el modelo (mín 0.5 / máx 3)"
              disabled={!hasModel}
              onClick={() => {
                // Centra con límites por defecto; no pisa el snapshot de «Guardar encuadre»
                getViewerService().fitCameraToModel({ resetLimits: true })
                patchCamera({ minDistance: 0.5, maxDistance: 3 })
                syncCameraFromViewer()
              }}
            >
              Encuadrar modelo
            </button>
            <button
              type="button"
              className="btn camera-actions__reset-all"
              title="Restablece FOV, límites, sensibilidades y vuelve al encuadre ¾ del modelo."
              onClick={resetCameraSettings}
            >
              <RotateCcw size={14} aria-hidden />
              Restablecer todo
            </button>
          </div>
          <div className="switch-row">
            <Switch
              checked={scene.camera.enableDamping}
              onChange={(v) => patchCamera({ enableDamping: v })}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">
                Inercia / damping
                <InfoTip text="La cámara sigue un poco el movimiento al soltar el ratón. Se desactiva automáticamente con «Movimiento reducido»." />
              </div>
            </div>
          </div>
          {scene.camera.enableDamping && (
            <Field
              label="Factor de inercia"
              tip="Más alto = más arrastre al soltar. Valores bajos se sienten más directos."
              onReset={() => resetCameraField('dampingFactor')}
            >
              <SliderInput
                value={scene.camera.dampingFactor}
                min={0.01}
                max={0.25}
                step={0.01}
                onChange={(v) => patchCamera({ dampingFactor: v })}
              />
            </Field>
          )}
          <Field
            label="Velocidad de rotación"
            tip="Sensibilidad al orbitar con el ratón o el dedo."
            onReset={() => resetCameraField('rotateSpeed')}
          >
            <SliderInput
              value={scene.camera.rotateSpeed}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => patchCamera({ rotateSpeed: v })}
            />
          </Field>
          <Field
            label="Velocidad de zoom"
            tip="Sensibilidad de la rueda o pellizco."
            onReset={() => resetCameraField('zoomSpeed')}
          >
            <SliderInput
              value={scene.camera.zoomSpeed}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => patchCamera({ zoomSpeed: v })}
            />
          </Field>
          <Field
            label="Velocidad de pan"
            tip="Sensibilidad al desplazar la vista (clic derecho / dos dedos)."
            onReset={() => resetCameraField('panSpeed')}
          >
            <SliderInput
              value={scene.camera.panSpeed}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => patchCamera({ panSpeed: v })}
            />
          </Field>
          <Field
            label="Near"
            tip="Plano cercano de recorte. Si el modelo se “come” al acercarte, súbelo un poco o bájalo."
            onReset={() =>
              patchCamera({ near: createDefaultSceneConfig().camera.near })
            }
          >
            <SliderInput
              value={scene.camera.near ?? 0.1}
              min={0.001}
              max={10}
              step={0.01}
              onChange={(v) => {
                const near = Math.max(0.001, v)
                patchCamera({
                  near,
                  far: Math.max(near + 0.1, scene.camera.far ?? 2000),
                })
              }}
            />
          </Field>
          <Field
            label="Far"
            tip="Plano lejano. Si desaparece el fondo o el modelo a lo lejos, súbelo."
            onReset={() =>
              patchCamera({ far: createDefaultSceneConfig().camera.far })
            }
          >
            <SliderInput
              value={scene.camera.far ?? 2000}
              min={Math.max(1, (scene.camera.near ?? 0.1) + 1)}
              max={Math.max(5000, (scene.camera.far ?? 2000) + 500)}
              step={10}
              onChange={(v) =>
                patchCamera({
                  far: Math.max((scene.camera.near ?? 0.1) + 0.1, v),
                })
              }
            />
          </Field>
        </Collapse>

        <Collapse title="Interacción" defaultOpen>
          <div className="switch-row">
            <Switch
              checked={scene.interaction.enableRotate}
              onChange={(v) => {
                if (v) {
                  setScene({
                    interaction: {
                      ...scene.interaction,
                      enableRotate: true,
                      enableHorizontal: true,
                      enableVertical: false,
                    },
                  })
                } else {
                  setScene({
                    interaction: {
                      ...scene.interaction,
                      enableRotate: false,
                      enableHorizontal: false,
                      enableVertical: false,
                    },
                  })
                }
              }}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">
                Rotación
                <InfoTip text="Orbitar alrededor del modelo. Ratón: clic izquierdo + arrastrar. Táctil: un dedo. Horizontal / Vertical limitan el eje." />
              </div>
              <div className="axis-toggles">
                <button
                  type="button"
                  className={`btn btn--chip${scene.interaction.enableHorizontal ? ' btn--active' : ''}`}
                  disabled={!scene.interaction.enableRotate}
                  title="Girar izquierda/derecha (eje Y)"
                  onClick={() => {
                    const nextH = !scene.interaction.enableHorizontal
                    const nextV = scene.interaction.enableVertical
                    if (!nextH && !nextV) {
                      setScene({
                        interaction: {
                          ...scene.interaction,
                          enableRotate: false,
                          enableHorizontal: false,
                          enableVertical: false,
                        },
                      })
                      return
                    }
                    setScene({
                      interaction: {
                        ...scene.interaction,
                        enableHorizontal: nextH,
                        enableRotate: true,
                      },
                    })
                  }}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  className={`btn btn--chip${scene.interaction.enableVertical ? ' btn--active' : ''}`}
                  disabled={!scene.interaction.enableRotate}
                  title="Inclinar arriba/abajo"
                  onClick={() => {
                    const nextV = !scene.interaction.enableVertical
                    const nextH = scene.interaction.enableHorizontal
                    if (!nextV && !nextH) {
                      setScene({
                        interaction: {
                          ...scene.interaction,
                          enableRotate: false,
                          enableHorizontal: false,
                          enableVertical: false,
                        },
                      })
                      return
                    }
                    setScene({
                      interaction: {
                        ...scene.interaction,
                        enableVertical: nextV,
                        enableRotate: true,
                      },
                    })
                  }}
                >
                  Vertical
                </button>
              </div>
              {!scene.interaction.enableHorizontal &&
                !scene.interaction.enableVertical &&
                scene.interaction.enableRotate && (
                  <p className="dim" style={{ marginTop: 4 }}>
                    Sin eje activo: la rotación se apaga.
                  </p>
                )}
            </div>
          </div>

          {(
            [
              [
                'enableZoom',
                'Zoom',
                'Acercar o alejar (cambia la distancia, no el FOV). Ratón: rueda de scroll o clic central + arrastrar. Táctil: pellizco con dos dedos.',
              ],
              [
                'enablePan',
                'Desplazamiento',
                'Mueve la cámara en el plano de la vista. Ratón: clic derecho + arrastrar, o Ctrl + clic izquierdo + arrastrar. Táctil: dos dedos arrastrando.',
              ],
              [
                'touchEnabled',
                'Táctil',
                'Permite gestos táctiles en pantallas touch (rotar, zoom, desplazar según los switches de arriba).',
              ],
              [
                'reducedMotion',
                'Movimiento reducido',
                'Accesibilidad: apaga la auto-rotación y la inercia de la cámara en el visor y en el módulo exportado. Al desactivarlo, la inercia vuelve al valor de «Inercia / damping».',
              ],
            ] as const
          ).map(([key, label, tip]) => (
            <div className="switch-row" key={key}>
              <Switch
                checked={scene.interaction[key]}
                onChange={(v) =>
                  setScene({ interaction: { ...scene.interaction, [key]: v } })
                }
              />
              <div className="switch-row__text">
                <div className="switch-row__name">
                  {label}
                  <InfoTip text={tip} />
                </div>
              </div>
            </div>
          ))}
        </Collapse>

        <Collapse title="Auto-rotación">
          <div className="switch-row">
            <Switch
              checked={scene.autoRotate.enabled}
              onChange={(v) => setScene({ autoRotate: { ...scene.autoRotate, enabled: v } })}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">Activada</div>
            </div>
          </div>
          <Field label="Velocidad">
            <NumberInput
              className="input-compact"
              value={scene.autoRotate.speed}
              min={0}
              max={10}
              step={0.1}
              onChange={(e) =>
                setScene({
                  autoRotate: {
                    ...scene.autoRotate,
                    speed: Math.max(0, Number(e.target.value) || 0),
                  },
                })
              }
            />
          </Field>
          <Field label="Dirección">
            <Select
              value={String(scene.autoRotate.direction)}
              onChange={(e) =>
                setScene({
                  autoRotate: {
                    ...scene.autoRotate,
                    direction: Number(e.target.value) as 1 | -1,
                  },
                })
              }
            >
              <option value="1">Horaria</option>
              <option value="-1">Antihoraria</option>
            </Select>
          </Field>
          <div className="switch-row">
            <Switch
              checked={scene.autoRotate.pauseOnInteract}
              onChange={(v) =>
                setScene({ autoRotate: { ...scene.autoRotate, pauseOnInteract: v } })
              }
            />
            <div className="switch-row__text">
              <div className="switch-row__name">Pausar al interactuar</div>
            </div>
          </div>
        </Collapse>

        <Collapse title="Iluminación">
          <div className="light-actions">
            <button
              type="button"
              className="btn"
              title="Luz ambiental (relleno general)"
              onClick={() => addLight('ambient')}
            >
              + Amb
            </button>
            <button
              type="button"
              className="btn"
              title="Luz hemisférica (cielo / suelo)"
              onClick={() => addLight('hemisphere')}
            >
              + Hemi
            </button>
            <button type="button" className="btn" onClick={() => addLight('directional')}>
              + Dir
            </button>
            <button type="button" className="btn" onClick={() => addLight('point')}>
              + Puntual
            </button>
            <button type="button" className="btn" onClick={() => addLight('spot')}>
              + Foco
            </button>
            <button
              type="button"
              className="btn"
              disabled={!hasModel}
              title="Lee KHR_lights_punctual del GLB actual"
              onClick={reimportLightsFromModel}
            >
              Del GLB
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
            Añade luces desde ángulos distintos o importa las del modelo. Al importar un GLB con
            luces, aparecen solas aquí.
          </p>
          <div className="switch-row">
            <Switch checked={showLightHelpers} onChange={onToggleLightHelpers} />
            <div className="switch-row__text">
              <div className="switch-row__name">
                Mostrar ayudas de luces
                <InfoTip text="Gizmos en el visor (dirección, alcance, cono). No se exportan al embed." />
              </div>
            </div>
          </div>
          {scene.lights.map((l) => {
            const pos = (l.position ?? [0, 1, 0]) as [number, number, number]
            const target = (l.target ?? [0, 0, 0]) as [number, number, number]
            const anchor = lightNeedsTarget(l.kind) ? target : ([0, 0, 0] as [number, number, number])
            const radialDist = vecDistance(pos, anchor)
            const collapsed = !l.enabled
            return (
              <div
                key={l.id}
                className={`light-card${collapsed ? ' light-card--collapsed' : ''}`}
              >
                <div className="light-card__header">
                  <strong className="light-card__title">
                    {l.name}{' '}
                    <span className="dim">({l.source === 'editor' ? 'editor' : 'importada'})</span>
                  </strong>
                  <div className="light-card__header-actions">
                    <button
                      type="button"
                      className="btn btn--icon"
                      title="Volver al ajuste original"
                      aria-label="Volver al ajuste original"
                      onClick={() => resetLight(l.id)}
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon btn--danger"
                      title="Eliminar luz"
                      aria-label="Eliminar luz"
                      onClick={() =>
                        setScene({ lights: scene.lights.filter((x) => x.id !== l.id) })
                      }
                    >
                      <X size={14} />
                    </button>
                    <Switch
                      checked={l.enabled}
                      onChange={(v) => updateLight(l.id, { enabled: v })}
                    />
                  </div>
                </div>
                {!collapsed && (
                  <div className="light-card__body">
                    <div className="light-card__controls light-card__controls--stack">
                      <label>
                        Color
                        <ColorInput
                          value={l.color}
                          onChange={(hex) => updateLight(l.id, { color: hex })}
                        />
                      </label>
                      <Field label="Intensidad">
                        <SliderInput
                          value={l.intensity}
                          min={0}
                          max={20}
                          step={0.05}
                          onChange={(v) => updateLight(l.id, { intensity: v })}
                        />
                      </Field>
                    </div>
                    {lightNeedsPosition(l.kind) && (
                      <>
                        <Field
                          label="Distancia"
                          tip={
                            lightNeedsTarget(l.kind)
                              ? 'Acerca o aleja la luz respecto al punto «Mira hacia», sin cambiar el ángulo.'
                              : 'Acerca o aleja la luz respecto al origen (0,0,0), sin cambiar la dirección.'
                          }
                        >
                          <SliderInput
                            value={Number(radialDist.toFixed(2))}
                            min={0.1}
                            max={Math.max(40, radialDist + 5)}
                            step={0.1}
                            onChange={(v) =>
                              updateLight(l.id, {
                                position: setDistanceFromAnchor(pos, anchor, v),
                              })
                            }
                          />
                        </Field>
                        <Field
                          label="Posición"
                          tip={
                            l.kind === 'directional' || l.kind === 'spot'
                              ? 'Desde dónde ilumina (dirección = posición → mira).'
                              : 'Dónde está la luz en la escena.'
                          }
                        >
                          <Vec3Sliders
                            value={pos}
                            onChange={(next) => updateLight(l.id, { position: next })}
                          />
                        </Field>
                      </>
                    )}
                    {lightNeedsTarget(l.kind) && (
                      <Field
                        label="Mira hacia"
                        tip="Punto al que apunta la luz (suele ser el centro del modelo)."
                      >
                        <Vec3Sliders
                          value={target}
                          onChange={(next) => updateLight(l.id, { target: next })}
                        />
                      </Field>
                    )}
                    {(l.kind === 'point' || l.kind === 'spot') && (
                      <Field
                        label="Alcance"
                        tip="Hasta dónde llega la luz (atenuación). 0 = sin límite. No es lo mismo que Distancia."
                      >
                        <SliderInput
                          value={l.distance ?? 0}
                          min={0}
                          max={50}
                          step={0.5}
                          onChange={(v) => updateLight(l.id, { distance: v })}
                        />
                      </Field>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </Collapse>

        <Collapse title="Entorno">
          <Field label="Fondo">
            <ColorInput
              value={scene.environment.background}
              onChange={(hex) =>
                setScene({
                  environment: { ...scene.environment, background: hex },
                })
              }
            />
          </Field>
          <Field label="Exposición">
            <NumberInput
              className="input-compact"
              value={scene.environment.exposure}
              min={0.1}
              max={5}
              step={0.05}
              onChange={(e) =>
                setScene({
                  environment: {
                    ...scene.environment,
                    exposure: Math.max(0.1, Number(e.target.value) || 0.1),
                  },
                })
              }
            />
          </Field>
          <Field label="DPR máximo" tip="Limita el devicePixelRatio del canvas.">
            <NumberInput
              className="input-compact"
              value={scene.environment.maxPixelRatio}
              min={1}
              max={3}
              step={0.25}
              onChange={(e) =>
                setScene({
                  environment: {
                    ...scene.environment,
                    maxPixelRatio: Math.min(3, Math.max(1, Number(e.target.value) || 1)),
                  },
                })
              }
            />
          </Field>
        </Collapse>

        <Collapse title="Transformación del modelo">
          <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
            Solo afecta al visor y al export del embed. No modifica el GLB ni las texturas.
          </p>
          <Field
            label="Escala"
            tip="1 = tamaño original. 0.5 = la mitad. 2 = el doble."
          >
            <NumberInput
              className="input-compact"
              value={scene.modelScale}
              min={0.01}
              step={0.01}
              onChange={(e) =>
                setScene({ modelScale: Math.max(0.01, Number(e.target.value) || 0.01) })
              }
            />
          </Field>
          <Field label="Posición" tip="Desplazamiento del modelo en la escena (unidades del modelo).">
            <div className="light-card__xyz">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <label key={axis}>
                  {axis}
                  <NumberInput
                    className="input-compact"
                    value={scene.modelPosition[i]}
                    step={0.1}
                    onChange={(e) =>
                      updateModelVec('modelPosition', i as 0 | 1 | 2, Number(e.target.value) || 0)
                    }
                  />
                </label>
              ))}
            </div>
          </Field>
          <Field label="Rotación (°)" tip="Rotación Euler en grados (X, Y, Z).">
            <div className="light-card__xyz">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <label key={axis}>
                  {axis}
                  <NumberInput
                    className="input-compact"
                    value={scene.modelRotation[i]}
                    step={1}
                    onChange={(e) =>
                      updateModelVec('modelRotation', i as 0 | 1 | 2, Number(e.target.value) || 0)
                    }
                  />
                </label>
              ))}
            </div>
          </Field>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setScene({
                modelScale: 1,
                modelPosition: [0, 0, 0],
                modelRotation: [0, 0, 0],
              })
            }
          >
            Restablecer transform
          </button>
        </Collapse>
      </div>
    </>
  )
}
