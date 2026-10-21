import { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import {
  Section,
  Collapse,
  Field,
  NumberInput,
  Select,
  Switch,
  ColorInput,
  InfoTip,
} from '../../components/ui'
import { getViewerService } from '../../viewer/ViewerService'
import { createDefaultSceneConfig } from '../../scene-config/defaults'
import type { EditorLight, LightKind } from '../../types'
import { createId } from '../../utils/id'

export function ScenePanel() {
  const scene = useAppStore((s) => s.scene)
  const setScene = useAppStore((s) => s.setScene)
  const syncCameraFromViewer = useAppStore((s) => s.syncCameraFromViewer)
  const setToast = useAppStore((s) => s.setToast)
  const hasModel = useAppStore((s) => s.hasModel)

  useEffect(() => {
    syncCameraFromViewer()
  }, [syncCameraFromViewer])

  function addLight(kind: LightKind) {
    const light: EditorLight = {
      id: createId('light'),
      kind,
      name: `${kind} ${scene.lights.length + 1}`,
      enabled: true,
      color: '#ffffff',
      intensity: kind === 'ambient' ? 0.4 : 1,
      position: [3, 5, 3],
      source: 'editor',
    }
    setScene({ lights: [...scene.lights, light] })
  }

  function updateLight(id: string, partial: Partial<EditorLight>) {
    setScene({
      lights: scene.lights.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    })
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

        <Collapse title="Cámara" defaultOpen>
          <Field label="Tipo">
            <Select
              value={scene.camera.type}
              onChange={(e) =>
                setScene({
                  camera: {
                    ...scene.camera,
                    type: e.target.value as 'perspective' | 'orthographic',
                  },
                })
              }
            >
              <option value="perspective">Perspectiva</option>
              <option value="orthographic">Ortográfica</option>
            </Select>
          </Field>
          <Field label="FOV">
            <NumberInput
              className="input-compact"
              value={scene.camera.fov}
              min={10}
              max={120}
              onChange={(e) =>
                setScene({ camera: { ...scene.camera, fov: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Distancia mín / máx">
            <div className="row">
              <NumberInput
                className="input-compact"
                value={scene.camera.minDistance}
                min={0.01}
                step={0.1}
                onChange={(e) => {
                  const minDistance = Math.max(0.01, Number(e.target.value) || 0.01)
                  const maxDistance = Math.max(minDistance, scene.camera.maxDistance)
                  setScene({ camera: { ...scene.camera, minDistance, maxDistance } })
                }}
              />
              <NumberInput
                className="input-compact"
                value={scene.camera.maxDistance}
                min={scene.camera.minDistance}
                step={0.1}
                onChange={(e) => {
                  const maxDistance = Math.max(
                    scene.camera.minDistance,
                    Number(e.target.value) || scene.camera.minDistance,
                  )
                  setScene({ camera: { ...scene.camera, maxDistance } })
                }}
              />
            </div>
          </Field>
          <div className="row">
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
                // Solo centra; no pisa el encuadre de «Guardar encuadre»
                getViewerService().fitCameraToModel()
                syncCameraFromViewer()
              }}
            >
              Encuadrar modelo
            </button>
          </div>
          <div className="switch-row">
            <Switch
              checked={scene.camera.enableDamping}
              onChange={(v) => setScene({ camera: { ...scene.camera, enableDamping: v } })}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">
                Inercia / damping
                <InfoTip text="La cámara sigue un poco el movimiento al soltar el ratón. Se desactiva automáticamente con «Movimiento reducido»." />
              </div>
            </div>
          </div>
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
          <div className="row" style={{ marginBottom: 8 }}>
            <button type="button" className="btn" onClick={() => addLight('directional')}>
              + Dir
            </button>
            <button type="button" className="btn" onClick={() => addLight('point')}>
              + Puntual
            </button>
            <button type="button" className="btn" onClick={() => addLight('spot')}>
              + Foco
            </button>
          </div>
          {scene.lights.map((l) => (
            <div key={l.id} className="light-card">
              <div className="row">
                <strong style={{ flex: 1 }}>
                  {l.name}{' '}
                  <span className="dim">({l.source === 'editor' ? 'editor' : 'importada'})</span>
                </strong>
                <Switch checked={l.enabled} onChange={(v) => updateLight(l.id, { enabled: v })} />
              </div>
              <div className="light-card__controls">
                <label>
                  Color
                  <ColorInput
                    value={l.color}
                    onChange={(hex) => updateLight(l.id, { color: hex })}
                  />
                </label>
                <label>
                  Intensidad
                  <NumberInput
                    className="input-compact"
                    value={l.intensity}
                    min={0}
                    max={20}
                    step={0.05}
                    onChange={(e) =>
                      updateLight(l.id, { intensity: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
              </div>
              {l.source === 'editor' && l.kind !== 'ambient' && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setScene({ lights: scene.lights.filter((x) => x.id !== l.id) })}
                >
                  Eliminar
                </button>
              )}
            </div>
          ))}
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
            Escala el objeto en la escena (1 = tamaño original del GLB). No cambia el archivo ni las
            texturas; solo cómo se ve / se exporta en el visor.
          </p>
          <Field
            label="Escala"
            tip="1 = tamaño original. 0.5 = la mitad. 2 = el doble. Útil si el modelo llega enorme o diminuto."
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
        </Collapse>
      </div>
    </>
  )
}
