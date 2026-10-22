/** Overlay de carga del bloque 3D (solo vista artículo). */
export function SceneLoading() {
  return (
    <div className="tjs-scene-loading" aria-live="polite" aria-busy="true">
      <div className="tjs-scene-loading__inner">
        <p className="tjs-scene-loading__text">Cargando modelo 3D…</p>
        <span className="tjs-scene-loading__spinner" />
      </div>
    </div>
  )
}
