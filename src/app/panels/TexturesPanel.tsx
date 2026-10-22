import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X, ZoomIn, ZoomOut, RotateCcw, Info, Eye, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Section, Field, NumberInput, Select, Badge } from '../../components/ui'
import {
  extractTextureInventory,
  removeTextureFromDocument,
  resizeSingleTexture,
  resizeAllTextures,
  compressAllTextures,
  compressSingleTexture,
  removeUnusedTextures,
  restoreTextureImageFromOriginal,
  restoreDeletedTexture,
  snapshotTextureImage,
  restoreAllTextureImagesFromOriginal,
  mapOriginalTextureSizes,
  textureIndexByName,
  estimateTextureBytes,
  type TextureEncodeFormat,
} from '../../textures/extractTextures'
import { getModelSession, updateWorkingGlb } from '../../store/modelSession'
import { writeDocumentToGlb, cloneDocumentFromGlb, readDocumentFromBuffer } from '../../model/gltfIo'
import { formatBytes, reductionPercent, formatPercent } from '../../utils/format'
import { downloadBlob } from '../../utils/download'
import type { TextureInfo, TextureMapRole } from '../../types'

type RoleFilter = 'all' | TextureMapRole

const ROLE_FILTERS: { id: RoleFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'baseColor', label: 'Base color' },
  { id: 'normal', label: 'Normal' },
  { id: 'metallicRoughness', label: 'Met./rough.' },
  { id: 'occlusion', label: 'Oclusión' },
  { id: 'emissive', label: 'Emissive' },
  { id: 'other', label: 'Otras' },
  { id: 'unknown', label: 'Sin uso' },
]

const ROLE_LABEL: Record<TextureMapRole, string> = {
  baseColor: 'Base color',
  normal: 'Normal',
  metallicRoughness: 'Metallic / roughness',
  occlusion: 'Oclusión',
  emissive: 'Emissive',
  other: 'Otra',
  unknown: 'Sin clasificar',
}

function briefToast(msg: string) {
  useAppStore.getState().setToast(msg)
  window.setTimeout(() => {
    if (useAppStore.getState().toastMessage === msg) {
      useAppStore.getState().setToast(null)
    }
  }, 2400)
}

export function TexturesPanel() {
  const hasModel = useAppStore((s) => s.hasModel)
  const textures = useAppStore((s) => s.textures)
  const setTextures = useAppStore((s) => s.setTextures)
  const reloadViewerFromWorking = useAppStore((s) => s.reloadViewerFromWorking)
  const pushHistory = useAppStore((s) => s.pushHistory)
  const updateStatsFromSession = useAppStore((s) => s.updateStatsFromSession)
  const markDirty = useAppStore((s) => s.markDirty)
  const askConfirm = useAppStore((s) => s.askConfirm)
  const historyIndex = useAppStore((s) => s.historyIndex)
  const [busy, setBusy] = useState(false)
  const [maxSize, setMaxSize] = useState(1024)
  const [encodeFormat, setEncodeFormat] = useState<TextureEncodeFormat>('webp')
  const [quality, setQuality] = useState(0.8)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [infoTexture, setInfoTexture] = useState<TextureInfo | null>(null)
  const [zoom, setZoom] = useState(1)
  const originalSizesRef = useRef<Map<string, { width: number; height: number }>>(new Map())

  useEffect(() => {
    if (!infoTexture && !preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (preview) setPreview(null)
      else setInfoTexture(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [infoTexture, preview])

  async function ensureOriginalSizes() {
    if (originalSizesRef.current.size > 0) return
    const session = getModelSession()
    if (!session) return
    const orig = await cloneDocumentFromGlb(session.originalGlb)
    originalSizesRef.current = await mapOriginalTextureSizes(orig)
  }

  async function refreshInventory() {
    const session = getModelSession()
    if (!session?.document) return
    await ensureOriginalSizes()
    const list = await extractTextureInventory(session.document)
    const withOrig = list.map((t) => {
      const o = originalSizesRef.current.get(t.name)
      return {
        ...t,
        active: true as const,
        originalWidth: o?.width,
        originalHeight: o?.height,
      }
    })
    const removed = [...session.removedTextures.values()].map((t) => {
      const o = originalSizesRef.current.get(t.name)
      return {
        ...t,
        active: false as const,
        originalWidth: o?.width ?? t.originalWidth,
        originalHeight: o?.height ?? t.originalHeight,
      }
    })
    const activeNames = new Set(withOrig.map((t) => t.name))
    const removedOnly = removed.filter((t) => !activeNames.has(t.name))
    setTextures([...withOrig, ...removedOnly])
  }

  useEffect(() => {
    originalSizesRef.current = new Map()
  }, [hasModel])

  useEffect(() => {
    if (!hasModel) return
    void refreshInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModel, historyIndex])

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  const active = textures.filter((t) => t.active)
  const removed = textures.filter((t) => !t.active)
  const filtered = useMemo(() => {
    if (roleFilter === 'all') return active
    return active.filter((t) => t.roles.includes(roleFilter))
  }, [active, roleFilter])

  const unusedCount = useMemo(
    () => active.filter((t) => t.usages.length === 0).length,
    [active],
  )

  const estimate = useMemo(
    () =>
      estimateTextureBytes(active, {
        maxSize,
        format: encodeFormat,
        quality,
      }),
    [active, maxSize, encodeFormat, quality],
  )

  async function withDoc(
    label: string,
    fn: (working: Awaited<ReturnType<typeof cloneDocumentFromGlb>>) => Promise<string | void>,
  ) {
    const session = getModelSession()
    if (!session) return
    setBusy(true)
    try {
      const doc = await cloneDocumentFromGlb(session.workingGlb)
      const detail = await fn(doc)
      const glb = await writeDocumentToGlb(doc)
      updateWorkingGlb(glb, doc)
      await reloadViewerFromWorking()
      updateStatsFromSession()
      await refreshInventory()
      pushHistory(detail ? `${label}: ${detail}` : label, glb, useAppStore.getState().stats)
      markDirty()
    } catch (err) {
      useAppStore
        .getState()
        .setError(err instanceof Error ? err.message : 'Error en texturas')
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(info: TextureInfo) {
    const session = getModelSession()
    if (!session?.document) return
    const ok = await askConfirm({
      title: 'Eliminar textura',
      message: `¿Eliminar «${info.name}»? Podrás restaurarla desde Eliminadas con el mismo tamaño/formato actuales.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const doc = await cloneDocumentFromGlb(session.workingGlb)
      const idx = textureIndexByName(doc, info.name)
      if (idx < 0) return
      const snap = snapshotTextureImage(doc, idx)
      removeTextureFromDocument(doc, idx)
      const glb = await writeDocumentToGlb(doc)
      updateWorkingGlb(glb, doc)
      session.removedTextures.set(info.id, {
        ...info,
        active: false,
        sourceImageData: null,
        encodedImage: snap?.image ?? null,
        mimeType: snap?.mimeType ?? info.mimeType,
        sizeBytes: snap?.image.byteLength ?? info.sizeBytes,
      })
      await reloadViewerFromWorking()
      updateStatsFromSession()
      pushHistory(`Eliminar textura ${info.name}`, glb, useAppStore.getState().stats)
      markDirty()
      await refreshInventory()
    } finally {
      setBusy(false)
    }
  }

  async function onRestoreDeleted(info: TextureInfo) {
    const session = getModelSession()
    if (!session) return
    setBusy(true)
    try {
      const working = await cloneDocumentFromGlb(session.workingGlb)
      const stored = session.removedTextures.get(info.id) ?? info
      const original = stored.encodedImage
        ? null
        : await cloneDocumentFromGlb(session.originalGlb)
      if (
        !restoreDeletedTexture(
          working,
          {
            name: stored.name,
            mimeType: stored.mimeType,
            encodedImage: stored.encodedImage,
            usages: stored.usages,
          },
          original,
        )
      ) {
        useAppStore.getState().setError(`No se pudo restaurar «${info.name}».`)
        return
      }
      const glb = await writeDocumentToGlb(working)
      updateWorkingGlb(glb, working)
      session.removedTextures.delete(info.id)
      await reloadViewerFromWorking()
      updateStatsFromSession()
      await refreshInventory()
      pushHistory(`Restaurar textura ${info.name}`, glb, useAppStore.getState().stats)
      markDirty()
    } finally {
      setBusy(false)
    }
  }

  async function onApplyOne(info: TextureInfo) {
    await withDoc(`Ajustar ${info.name}`, async (doc) => {
      const idx = textureIndexByName(doc, info.name)
      if (idx < 0) throw new Error('Textura no encontrada')
      await resizeSingleTexture(doc, idx, maxSize)
      await compressSingleTexture(doc, idx, encodeFormat, quality)
    })
  }

  async function onResizeAll() {
    const ok = await askConfirm({
      title: 'Aplicar máximo a todas',
      message: `¿Poner todas las texturas a ≤${maxSize}px partiendo del original? Si antes las bajaste, al subir este valor se regeneran hasta ese tope.`,
      confirmLabel: 'Aplicar a todas',
    })
    if (!ok) return
    const session = getModelSession()
    if (!session) return
    setBusy(true)
    try {
      const working = await cloneDocumentFromGlb(session.workingGlb)
      const original = await cloneDocumentFromGlb(session.originalGlb)
      const n = await resizeAllTextures(working, maxSize, original)
      const glb = await writeDocumentToGlb(working)
      updateWorkingGlb(glb, working)
      await reloadViewerFromWorking()
      updateStatsFromSession()
      await refreshInventory()
      pushHistory(`Máx. ${maxSize}px en todas (${n})`, glb, useAppStore.getState().stats)
      markDirty()
      briefToast(`Aplicado a ${n} textura(s)`)
    } catch (err) {
      useAppStore
        .getState()
        .setError(err instanceof Error ? err.message : 'Error al redimensionar')
    } finally {
      setBusy(false)
    }
  }

  async function onCompressAll() {
    const ok = await askConfirm({
      title: 'Comprimir texturas',
      message: `¿Convertir ${active.length} textura(s) a ${encodeFormat.toUpperCase()} (calidad ${Math.round(quality * 100)}%)?`,
      confirmLabel: 'Comprimir',
    })
    if (!ok) return
    await withDoc(`Comprimir ${encodeFormat}`, async (doc) => {
      const n = await compressAllTextures(doc, encodeFormat, quality)
      briefToast(`Comprimidas: ${n}`)
      return String(n)
    })
  }

  async function onRemoveUnused() {
    if (unusedCount === 0) {
      briefToast('No hay texturas sin uso')
      return
    }
    const ok = await askConfirm({
      title: 'Quitar no usadas',
      message: `¿Eliminar ${unusedCount} textura(s) sin referencias en materiales?`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await withDoc('Quitar texturas no usadas', async (doc) => {
      const n = removeUnusedTextures(doc)
      briefToast(`Eliminadas: ${n}`)
      return String(n)
    })
  }

  async function onRestoreResolution(info: TextureInfo) {
    const session = getModelSession()
    if (!session) return
    setBusy(true)
    try {
      const working = await cloneDocumentFromGlb(session.workingGlb)
      const original = await cloneDocumentFromGlb(session.originalGlb)
      if (!restoreTextureImageFromOriginal(working, original, info.name)) {
        useAppStore.getState().setError(`No se encontró «${info.name}» en el original.`)
        return
      }
      const glb = await writeDocumentToGlb(working)
      updateWorkingGlb(glb, working)
      await reloadViewerFromWorking()
      updateStatsFromSession()
      await refreshInventory()
      pushHistory(`Resolución original: ${info.name}`, glb, useAppStore.getState().stats)
      markDirty()
    } finally {
      setBusy(false)
    }
  }

  async function onRestoreAllResolutions() {
    const downsized = active.filter(
      (t) =>
        t.originalWidth &&
        t.originalHeight &&
        (t.width < t.originalWidth || t.height < t.originalHeight),
    ).length
    if (downsized === 0) {
      briefToast('Ninguna textura está redimensionada')
      return
    }
    const ok = await askConfirm({
      title: 'Restaurar resoluciones',
      message: `¿Devolver la resolución original a ${downsized} textura(s)? No afecta a eliminadas ni a otras optimizaciones.`,
      confirmLabel: 'Restaurar todas',
    })
    if (!ok) return
    const session = getModelSession()
    if (!session) return
    setBusy(true)
    try {
      const working = await cloneDocumentFromGlb(session.workingGlb)
      const original = await cloneDocumentFromGlb(session.originalGlb)
      const n = restoreAllTextureImagesFromOriginal(working, original)
      const glb = await writeDocumentToGlb(working)
      updateWorkingGlb(glb, working)
      await reloadViewerFromWorking()
      updateStatsFromSession()
      await refreshInventory()
      pushHistory(`Resoluciones originales (${n})`, glb, useAppStore.getState().stats)
      markDirty()
      briefToast(`Restauradas: ${n}`)
    } finally {
      setBusy(false)
    }
  }

  async function onDownload(info: TextureInfo) {
    const session = getModelSession()
    if (!session?.document) return
    session.document = await readDocumentFromBuffer(session.workingGlb)
    const idx = textureIndexByName(session.document, info.name)
    const tex = session.document.getRoot().listTextures()[idx]
    const image = tex?.getImage()
    if (!image) {
      useAppStore.getState().setError('No hay datos descargables.')
      return
    }
    const mime = tex.getMimeType() || 'application/octet-stream'
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('jpeg') || mime.includes('jpg')
        ? 'jpg'
        : mime.includes('webp')
          ? 'webp'
          : 'bin'
    downloadBlob(new Blob([image.slice()], { type: mime }), `${tex.getName() || 'texture'}.${ext}`)
  }

  function isDownsized(t: TextureInfo): boolean {
    if (!t.originalWidth || !t.originalHeight) return false
    return t.width < t.originalWidth || t.height < t.originalHeight
  }

  if (!hasModel) {
    return (
      <>
        <div className="tools-panel__header">
          <h1>Texturas</h1>
        </div>
        <div className="tools-panel__body">
          <p className="muted">Importa un modelo para inspeccionar texturas.</p>
        </div>
      </>
    )
  }

  const estDelta = reductionPercent(estimate.current, estimate.estimated)

  return (
    <>
      <div className="tools-panel__header">
        <h1>Texturas</h1>
      </div>
      <div className="tools-panel__body">
        <Field label="Máx. al redimensionar (px)">
          <div className="row" style={{ alignItems: 'stretch' }}>
            <NumberInput
              value={maxSize}
              min={64}
              max={8192}
              step={64}
              onChange={(e) => setMaxSize(Math.max(64, Number(e.target.value) || 64))}
            />
            <button
              type="button"
              className="btn"
              style={{ flex: '0 0 auto' }}
              disabled={busy || active.length === 0}
              onClick={() => void onResizeAll()}
            >
              Aplicar a todas
            </button>
          </div>
        </Field>

        <Field label="Comprimir formato">
          <div className="row" style={{ alignItems: 'stretch' }}>
            <Select
              value={encodeFormat}
              onChange={(e) => setEncodeFormat(e.target.value as TextureEncodeFormat)}
            >
              <option value="webp">WebP</option>
              <option value="jpeg">JPEG</option>
            </Select>
            <button
              type="button"
              className="btn"
              style={{ flex: '0 0 auto' }}
              disabled={busy || active.length === 0}
              onClick={() => void onCompressAll()}
            >
              Comprimir todas
            </button>
          </div>
        </Field>
        <Field label={`Calidad ${Math.round(quality * 100)}%`}>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </Field>

        <div className="texture-estimate">
          <div>
            <span className="dim">Actual texturas</span>
            <strong>{formatBytes(estimate.current)}</strong>
          </div>
          <div>
            <span className="dim">Si resize+{encodeFormat}</span>
            <strong>~{formatBytes(estimate.estimated)}</strong>
          </div>
          <div>
            <span className="dim">Ahorro est.</span>
            <strong>{formatPercent(estDelta)}</strong>
          </div>
        </div>

        <div className="stack" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btn btn--block"
            disabled={busy || unusedCount === 0}
            onClick={() => void onRemoveUnused()}
          >
            Quitar no usadas ({unusedCount})
          </button>
          <button
            type="button"
            className="btn btn--block"
            disabled={busy || active.length === 0}
            title="Devuelve cada textura a su tamaño original del archivo importado"
            onClick={() => void onRestoreAllResolutions()}
          >
            Restaurar tamaños originales
          </button>
        </div>

        <div className="axis-toggles" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn btn--chip${roleFilter === f.id ? ' btn--active' : ''}`}
              onClick={() => setRoleFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Section title={`Activas (${filtered.length}/${active.length})`}>
          <div className="texture-grid">
            {filtered.map((t) => (
              <div key={t.id} className="texture-card">
                <div className="texture-card__thumb">
                  {t.thumbnailDataUrl ? (
                    <img src={t.thumbnailDataUrl} alt="" />
                  ) : (
                    <span className="dim">sin preview</span>
                  )}
                  <div className="texture-card__thumb-actions">
                    <button
                      type="button"
                      className="btn btn--icon texture-card__overlay-btn"
                      title="Ver textura"
                      aria-label={`Ver ${t.name}`}
                      disabled={busy || !t.thumbnailDataUrl}
                      onClick={() => {
                        if (!t.thumbnailDataUrl) return
                        setZoom(1)
                        setPreview({ url: t.thumbnailDataUrl, name: t.name })
                      }}
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon texture-card__overlay-btn"
                      title="Información"
                      aria-label={`Información de ${t.name}`}
                      onClick={() => setInfoTexture(t)}
                    >
                      <Info size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon texture-card__overlay-btn"
                      title="Descargar"
                      aria-label={`Descargar ${t.name}`}
                      disabled={busy}
                      onClick={() => void onDownload(t)}
                    >
                      <Download size={13} />
                    </button>
                  </div>
                </div>
                <div className="texture-card__body">
                  <div className="texture-card__name" title={t.name}>
                    {t.name}
                  </div>
                  <div className="texture-card__meta">
                    {t.width}×{t.height}
                    {isDownsized(t) && t.originalWidth && t.originalHeight
                      ? ` ← ${t.originalWidth}×${t.originalHeight}`
                      : ''}
                    {' · '}
                    {formatBytes(t.sizeBytes)}
                    {' · '}
                    {t.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') || '—'}
                    {t.usages.length === 0 ? ' · sin uso' : ''}
                  </div>
                  <div className="texture-card__actions">
                    <button
                      type="button"
                      className="btn btn--primary texture-card__apply"
                      disabled={busy}
                      title={`Reducir a ≤${maxSize}px y comprimir a ${encodeFormat.toUpperCase()} (calidad ${Math.round(quality * 100)}%)`}
                      onClick={() => void onApplyOne(t)}
                    >
                      Aplicar
                    </button>
                    {isDownsized(t) && (
                      <button
                        type="button"
                        className="btn btn--icon"
                        title="Restaurar resolución original"
                        aria-label="Restaurar original"
                        disabled={busy}
                        onClick={() => void onRestoreResolution(t)}
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--icon btn--danger"
                      title="Eliminar"
                      aria-label={`Eliminar ${t.name}`}
                      disabled={busy}
                      onClick={() => void onRemove(t)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Eliminadas (${removed.length})`}>
          {removed.length === 0 ? (
            <p className="muted">Ninguna eliminada.</p>
          ) : (
            <div className="stack">
              {removed.map((t) => (
                <div key={t.id} className="texture-removed">
                  <div className="texture-removed__thumb">
                    {t.thumbnailDataUrl ? (
                      <img src={t.thumbnailDataUrl} alt="" />
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </div>
                  <div className="texture-removed__info">
                    <div className="project-card__name">{t.name}</div>
                    <div className="project-card__meta">
                      {t.width}×{t.height} · {t.roles.join(', ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void onRestoreDeleted(t)}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {infoTexture &&
        createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setInfoTexture(null)}
          >
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="texture-info-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__header">
                <h2 id="texture-info-title">Textura</h2>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="Cerrar"
                  onClick={() => setInfoTexture(null)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="modal__body">
                <dl className="texture-info-dl">
                  <dt>Nombre</dt>
                  <dd>{infoTexture.name || '—'}</dd>
                  <dt>UUID</dt>
                  <dd>
                    <code>{infoTexture.uuid}</code>
                  </dd>
                  <dt>Resolución</dt>
                  <dd>
                    {infoTexture.width}×{infoTexture.height}
                    {infoTexture.originalWidth &&
                    infoTexture.originalHeight &&
                    (infoTexture.width !== infoTexture.originalWidth ||
                      infoTexture.height !== infoTexture.originalHeight)
                      ? ` (original ${infoTexture.originalWidth}×${infoTexture.originalHeight})`
                      : ''}
                  </dd>
                  <dt>Formato</dt>
                  <dd>{infoTexture.format || '—'}</dd>
                  <dt>MIME</dt>
                  <dd>{infoTexture.mimeType || '—'}</dd>
                  <dt>Tamaño</dt>
                  <dd>
                    {formatBytes(infoTexture.sizeBytes)}{' '}
                    <Badge>
                      {infoTexture.sizeConfidence === 'exact' ? 'exacto' : 'estimado'}
                    </Badge>
                  </dd>
                  <dt>Roles</dt>
                  <dd>
                    {infoTexture.roles.length
                      ? infoTexture.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')
                      : '—'}
                  </dd>
                  <dt>Estado</dt>
                  <dd>{infoTexture.active ? 'Activa' : 'Eliminada'}</dd>
                  <dt>Usos</dt>
                  <dd>
                    {infoTexture.usages.length === 0
                      ? 'Sin uso en materiales'
                      : `${infoTexture.usages.length} material${infoTexture.usages.length === 1 ? '' : 'es'}`}
                  </dd>
                </dl>
                {infoTexture.usages.length > 0 && (
                  <ul className="texture-info-usages">
                    {infoTexture.usages.map((u, i) => (
                      <li key={`${u.materialUuid}-${u.slot}-${i}`}>
                        <strong>{u.materialName || 'Material sin nombre'}</strong>
                        <div className="dim">
                          Slot: {u.slot} · Rol: {ROLE_LABEL[u.role] ?? u.role}
                        </div>
                        {u.objectNames.length > 0 && (
                          <div className="dim">
                            Objetos: {u.objectNames.slice(0, 12).join(', ')}
                            {u.objectNames.length > 12
                              ? ` (+${u.objectNames.length - 12})`
                              : ''}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="modal__footer modal__footer--actions">
                <button type="button" className="btn btn--primary" onClick={() => setInfoTexture(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {preview && (
        <div
          className="texture-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Vista de ${preview.name}`}
          onClick={() => setPreview(null)}
        >
          <div className="texture-lightbox__toolbar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn--icon"
              title="Alejar"
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
            >
              <ZoomOut size={14} />
            </button>
            <span className="dim" style={{ minWidth: 48, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn btn--icon"
              title="Acercar"
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
            >
              <ZoomIn size={14} />
            </button>
            <button type="button" className="btn" onClick={() => setZoom(1)}>
              100%
            </button>
            <button
              type="button"
              className="btn btn--icon"
              title="Cerrar"
              onClick={() => setPreview(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div
            className="texture-lightbox__stage"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault()
              const delta = e.deltaY > 0 ? -0.1 : 0.1
              setZoom((z) => Math.min(4, Math.max(0.25, Number((z + delta).toFixed(2)))))
            }}
          >
            <img
              src={preview.url}
              alt={preview.name}
              className={zoom > 1 ? 'is-zoomed' : undefined}
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        </div>
      )}
    </>
  )
}
