import { useEffect } from 'react'
import {
  Box,
  Image,
  Sparkles,
  Clapperboard,
  Newspaper,
  Gauge,
  Package,
  HelpCircle,
  PanelLeft,
  PanelLeftClose,
  Sun,
  Moon,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { PanelSection } from '../types'

const ITEMS: { id: PanelSection; label: string; icon: typeof Box }[] = [
  { id: 'model', label: 'Modelo', icon: Box },
  { id: 'textures', label: 'Texturas', icon: Image },
  { id: 'optimization', label: 'Optimización', icon: Sparkles },
  { id: 'scene', label: 'Escena', icon: Clapperboard },
  { id: 'editorial', label: 'Editorial', icon: Newspaper },
  { id: 'performance', label: 'Rendimiento', icon: Gauge },
  { id: 'export', label: 'Exportación', icon: Package },
]

/** Escena se puede configurar sin modelo; el resto requiere import. */
const UNLOCKED_WITHOUT_MODEL = new Set<PanelSection>(['model', 'scene'])

export function SideNav() {
  const active = useAppStore((s) => s.activePanel)
  const setActive = useAppStore((s) => s.setActivePanel)
  const hasModel = useAppStore((s) => s.hasModel)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded)
  const setSidebarExpanded = useAppStore((s) => s.setSidebarExpanded)

  useEffect(() => {
    if (!hasModel && !UNLOCKED_WITHOUT_MODEL.has(active)) setActive('model')
  }, [hasModel, active, setActive])

  return (
    <aside
      className={`sidebar${sidebarExpanded ? ' sidebar--expanded' : ''}`}
      aria-label="Navegación principal"
    >
      <nav className="sidebar__nav">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const locked = !hasModel && !UNLOCKED_WITHOUT_MODEL.has(id)
          return (
            <button
              key={id}
              type="button"
              className={`nav-btn${active === id ? ' nav-btn--active' : ''}`}
              title={locked ? 'Importa un modelo primero' : label}
              aria-label={label}
              aria-current={active === id ? 'page' : undefined}
              disabled={locked}
              onClick={() => {
                if (locked) return
                setActive(id)
              }}
            >
              <Icon size={18} strokeWidth={1.75} />
              {sidebarExpanded ? <span className="nav-btn__label">{label}</span> : null}
            </button>
          )
        })}
      </nav>
      <div className="sidebar__footer">
        <button
          type="button"
          className="nav-btn"
          title={sidebarExpanded ? 'Contraer menú' : 'Expandir menú'}
          aria-label={sidebarExpanded ? 'Contraer menú' : 'Expandir menú'}
          aria-pressed={sidebarExpanded}
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
        >
          {sidebarExpanded ? (
            <PanelLeftClose size={18} strokeWidth={1.75} />
          ) : (
            <PanelLeft size={18} strokeWidth={1.75} />
          )}
          {sidebarExpanded ? <span className="nav-btn__label">Menú</span> : null}
        </button>
        <button
          type="button"
          className="nav-btn"
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? (
            <Sun size={18} strokeWidth={1.75} />
          ) : (
            <Moon size={18} strokeWidth={1.75} />
          )}
          {sidebarExpanded ? (
            <span className="nav-btn__label">{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="nav-btn"
          title="Info"
          aria-label="Info"
          onClick={() => setHelpOpen(true)}
        >
          <HelpCircle size={18} strokeWidth={1.75} />
          {sidebarExpanded ? <span className="nav-btn__label">Info</span> : null}
        </button>
      </div>
    </aside>
  )
}
