import { Minus, Monitor, Newspaper, Plus, Smartphone, Tablet } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ArticlePreviewWidth } from '../../types'
import {
  clampParagraphCount,
  MAX_PARAGRAPHS,
  MIN_PARAGRAPHS,
} from '../../editorial/lorem'
import { ARTICLE_PREVIEW_SIZES } from '../../editorial/previewSizes'
import { Section, Field, Switch, NumberInput, Select } from '../../components/ui'

const PREVIEW_WIDTHS: { value: ArticlePreviewWidth; label: string; hint: string; icon: typeof Monitor }[] =
  [
    { value: '100%', label: 'Desktop', hint: '100%', icon: Monitor },
    {
      value: 1024,
      label: 'Tablet',
      hint: `${ARTICLE_PREVIEW_SIZES[1024].width}×${ARTICLE_PREVIEW_SIZES[1024].height}`,
      icon: Tablet,
    },
    {
      value: 699,
      label: 'Móvil L',
      hint: `${ARTICLE_PREVIEW_SIZES[699].width}×${ARTICLE_PREVIEW_SIZES[699].height}`,
      icon: Tablet,
    },
    {
      value: 375,
      label: 'Móvil',
      hint: `${ARTICLE_PREVIEW_SIZES[375].width}×${ARTICLE_PREVIEW_SIZES[375].height}`,
      icon: Smartphone,
    },
    {
      value: 320,
      label: 'Móvil S',
      hint: `${ARTICLE_PREVIEW_SIZES[320].width}×${ARTICLE_PREVIEW_SIZES[320].height}`,
      icon: Smartphone,
    },
  ]

/**
 * Textos + contenedor web. La previsualización real del artículo está en el visor
 * (botón «Vista artículo»).
 */
export function EditorialPanel() {
  const scene = useAppStore((s) => s.scene)
  const setScene = useAppStore((s) => s.setScene)
  const setViewerMode = useAppStore((s) => s.setViewerMode)
  const viewerMode = useAppStore((s) => s.viewerMode)
  const articlePreviewWidth = useAppStore((s) => s.articlePreviewWidth)
  const setArticlePreviewWidth = useAppStore((s) => s.setArticlePreviewWidth)
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
            Mock de página ABC (cabecera, columna 609px y pie). Nada es clicable.
          </p>
        </Section>

        <Section title="Ancho del visor">
          <p className="muted" style={{ marginBottom: 8 }}>
            Simula el tamaño del artículo para comprobar el responsive del mock.
          </p>
          <div className="article-preview-widths" role="group" aria-label="Ancho del visor">
            {PREVIEW_WIDTHS.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={String(value)}
                type="button"
                className={`btn article-preview-widths__btn${
                  articlePreviewWidth === value ? ' btn--active' : ''
                }`}
                title={`${label} (${hint})`}
                aria-pressed={articlePreviewWidth === value}
                onClick={() => {
                  setArticlePreviewWidth(value)
                  if (viewerMode !== 'editorial') setViewerMode('editorial')
                }}
              >
                <Icon size={15} />
                <span className="article-preview-widths__label">{label}</span>
                <span className="article-preview-widths__hint">{hint}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Textos">
          <p className="muted editorial-texts-hint">
            Lorem ipsum fijo. Usa + / − para el número de párrafos del mock.
          </p>
          {(
            [
              ['textAboveEnabled', 'textAboveParagraphs', 'Texto superior'],
              ['textBelowEnabled', 'textBelowParagraphs', 'Texto inferior'],
            ] as const
          ).map(([enabledKey, countKey, label]) => {
            const count = clampParagraphCount(e[countKey] ?? 2)
            return (
              <div key={countKey} className="editorial-field">
                <div className="switch-row editorial-field__row">
                  <Switch
                    checked={e[enabledKey]}
                    onChange={(v) => setScene({ editorial: { ...e, [enabledKey]: v } })}
                  />
                  <div className="switch-row__text">
                    <div className="switch-row__name">{label}</div>
                  </div>
                  {e[enabledKey] && (
                    <div className="editorial-paragraphs">
                      <button
                        type="button"
                        className="btn btn--icon"
                        title="Quitar párrafo"
                        disabled={count <= MIN_PARAGRAPHS}
                        onClick={() =>
                          setScene({
                            editorial: {
                              ...e,
                              [countKey]: clampParagraphCount(count - 1),
                            },
                          })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span className="editorial-paragraphs__count">{count}</span>
                      <button
                        type="button"
                        className="btn btn--icon"
                        title="Añadir párrafo"
                        disabled={count >= MAX_PARAGRAPHS}
                        onClick={() =>
                          setScene({
                            editorial: {
                              ...e,
                              [countKey]: clampParagraphCount(count + 1),
                            },
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </Section>

        <Section title="Ayuda 3D">
          <div className="switch-row">
            <Switch
              checked={e.rotateHelpEnabled ?? true}
              onChange={(v) => setScene({ editorial: { ...e, rotateHelpEnabled: v } })}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">Arrastra para girar</div>
              <div className="switch-row__desc">Icono 360° arriba a la izquierda del bloque</div>
            </div>
          </div>
        </Section>

        <Section title="Carga del 3D">
          <div className="switch-row">
            <Switch
              checked={e.lazyLoad ?? false}
              onChange={(v) => setScene({ editorial: { ...e, lazyLoad: v } })}
            />
            <div className="switch-row__text">
              <div className="switch-row__name">Lazy load</div>
              <div className="switch-row__desc">
                {e.lazyLoad
                  ? 'Carga al entrar el bloque en el viewport'
                  : 'Carga desde el inicio'}
              </div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            En la vista artículo se muestra «Cargando modelo 3D…» hasta que el embed está listo.
          </p>
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
                    heightValue: 50,
                    heightUnit: 'vh',
                    aspectRatio: null,
                  },
                  fullvh: {
                    widthValue: 100,
                    widthUnit: '%',
                    heightValue: 100,
                    heightUnit: 'vh',
                    aspectRatio: null,
                  },
                  fullscreen: {
                    widthValue: 100,
                    widthUnit: 'full',
                    heightValue: 100,
                    heightUnit: 'vh',
                    aspectRatio: null,
                  },
                }
                setScene({
                  container: { ...c, ...(presets[preset] || {}), preset },
                })
              }}
            >
              <option value="square">Cuadrado (480×480)</option>
              <option value="vertical">Vertical (360×640)</option>
              <option value="horizontal">Horizontal (100% × 480px)</option>
              <option value="panoramic">Panorámico (100% × 360px)</option>
              <option value="fullwidth">Ancho completo (100vw × 50vh)</option>
              <option value="fullvh">Alto viewport (100vh marco)</option>
              <option value="fullscreen">Pantalla completa (100vw × 100vh)</option>
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
                <option value="%">% columna</option>
                <option value="full">vw marco</option>
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
                <option value="vh">vh marco</option>
                <option value="%">% marco</option>
                <option value="auto">auto</option>
              </Select>
            </div>
          </Field>
          <p className="muted" style={{ marginTop: 4 }}>
            Fondo = entorno. Unidades relativas al mock: <strong>vh</strong> / <strong>vw
            marco</strong> = marco del artículo; <strong>% columna</strong> = columna ~609px.
          </p>
        </Section>
      </div>
    </>
  )
}
