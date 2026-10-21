import { Newspaper } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Field, TextInput, Switch, NumberInput, Select, ColorInput } from '../../components/ui'

/**
 * Textos + contenedor web. La previsualización real del artículo está en el visor
 * (botón «Vista artículo»).
 */
export function EditorialPanel() {
  const scene = useAppStore((s) => s.scene)
  const setScene = useAppStore((s) => s.setScene)
  const setViewerMode = useAppStore((s) => s.setViewerMode)
  const viewerMode = useAppStore((s) => s.viewerMode)
  const e = scene.editorial
  const c = scene.container

  return (
    <>
      <div className="tools-panel__header">
        <h1>Editorial</h1>
      </div>
      <div className="tools-panel__body">
        <Section title="Previsualización">
          <button
            type="button"
            className={`btn btn--block${viewerMode === 'editorial' ? ' btn--active' : ''}`}
            onClick={() => setViewerMode(viewerMode === 'editorial' ? '3d' : 'editorial')}
          >
            <Newspaper size={14} />
            {viewerMode === 'editorial' ? 'Volver al visor 3D' : 'Ver como artículo en el visor'}
          </button>
          <p className="dim" style={{ marginTop: 6 }}>
            El canvas 3D se embebe en un mock de pieza periodística (título, entradilla, pie…).
          </p>
        </Section>

        <Section title="Textos">
          {(
            [
              ['title', 'titleEnabled', 'Título'],
              ['lead', 'leadEnabled', 'Entradilla'],
              ['textAbove', 'textAboveEnabled', 'Texto superior'],
              ['textBelow', 'textBelowEnabled', 'Texto inferior'],
              ['caption', 'captionEnabled', 'Pie de imagen'],
              ['credits', 'creditsEnabled', 'Créditos'],
              ['altText', 'altTextEnabled', 'Texto alternativo (accesibilidad)'],
            ] as const
          ).map(([key, enabledKey, label]) => (
            <div key={key} className="editorial-field">
              <div className="switch-row">
                <Switch
                  checked={e[enabledKey]}
                  onChange={(v) => setScene({ editorial: { ...e, [enabledKey]: v } })}
                />
                <div className="switch-row__text">
                  <div className="switch-row__name">{label}</div>
                </div>
              </div>
              {e[enabledKey] && (
                <TextInput
                  value={e[key]}
                  placeholder={label}
                  onChange={(ev) =>
                    setScene({ editorial: { ...e, [key]: ev.target.value } })
                  }
                />
              )}
            </div>
          ))}
        </Section>

        <Section title="Contenedor web">
          <p className="muted" style={{ marginBottom: 8 }}>
            Define el tamaño CSS del bloque 3D dentro del artículo. Se refleja al instante en la
            vista artículo del visor.
          </p>
          <Field label="Preset">
            <Select
              value={c.preset}
              onChange={(ev) => {
                const preset = ev.target.value
                const presets: Record<string, Partial<typeof c>> = {
                  square: {
                    widthValue: 480,
                    widthUnit: 'px',
                    heightValue: 480,
                    heightUnit: 'px',
                    aspectRatio: '1 / 1',
                  },
                  vertical: {
                    widthValue: 360,
                    widthUnit: 'px',
                    heightValue: 640,
                    heightUnit: 'px',
                    aspectRatio: '9 / 16',
                  },
                  horizontal: {
                    widthValue: 100,
                    widthUnit: '%',
                    heightValue: 480,
                    heightUnit: 'px',
                    aspectRatio: '16 / 9',
                  },
                  panoramic: {
                    widthValue: 100,
                    widthUnit: '%',
                    heightValue: 360,
                    heightUnit: 'px',
                    aspectRatio: '21 / 9',
                  },
                  fullwidth: {
                    widthValue: 100,
                    widthUnit: 'full',
                    heightValue: 520,
                    heightUnit: 'px',
                    aspectRatio: null,
                  },
                  fullvh: {
                    widthValue: 100,
                    widthUnit: '%',
                    heightValue: 55,
                    heightUnit: 'vh',
                    aspectRatio: null,
                  },
                }
                setScene({
                  container: { ...c, ...(presets[preset] || {}), preset },
                })
              }}
            >
              <option value="square">Cuadrado</option>
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
              <option value="panoramic">Panorámico</option>
              <option value="fullwidth">Ancho completo</option>
              <option value="fullvh">Alto viewport</option>
              <option value="custom">Personalizado</option>
            </Select>
          </Field>
          <Field label="Ancho">
            <div className="row">
              <NumberInput
                className="input-compact"
                value={c.widthValue}
                min={0}
                onChange={(ev) =>
                  setScene({
                    container: {
                      ...c,
                      widthValue: Math.max(0, Number(ev.target.value) || 0),
                      preset: 'custom',
                    },
                  })
                }
              />
              <Select
                value={c.widthUnit}
                onChange={(ev) =>
                  setScene({
                    container: {
                      ...c,
                      widthUnit: ev.target.value as typeof c.widthUnit,
                      preset: 'custom',
                    },
                  })
                }
              >
                <option value="px">px</option>
                <option value="%">%</option>
                <option value="full">full</option>
              </Select>
            </div>
          </Field>
          <Field label="Alto">
            <div className="row">
              <NumberInput
                className="input-compact"
                value={c.heightValue}
                min={0}
                onChange={(ev) =>
                  setScene({
                    container: {
                      ...c,
                      heightValue: Math.max(0, Number(ev.target.value) || 0),
                      preset: 'custom',
                    },
                  })
                }
              />
              <Select
                value={c.heightUnit}
                onChange={(ev) =>
                  setScene({
                    container: {
                      ...c,
                      heightUnit: ev.target.value as typeof c.heightUnit,
                      preset: 'custom',
                    },
                  })
                }
              >
                <option value="px">px</option>
                <option value="vh">vh</option>
                <option value="%">%</option>
                <option value="auto">auto</option>
              </Select>
            </div>
          </Field>
          <Field label="Fondo del bloque">
            <ColorInput
              value={c.background}
              onChange={(hex) => setScene({ container: { ...c, background: hex } })}
            />
          </Field>
        </Section>
      </div>
    </>
  )
}
