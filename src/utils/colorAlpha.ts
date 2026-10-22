/** Parsea fondo (#rgb / #rrggbb / #rrggbbaa / transparent / rgba). */
export function parseColorAlpha(value: string): { hex: string; alpha: number } {
  const v = (value || '').trim().toLowerCase()
  if (!v || v === 'transparent' || v === 'none') {
    return { hex: '#ffffff', alpha: 0 }
  }
  const rgba = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  )
  if (rgba) {
    const r = Math.round(Number(rgba[1]))
    const g = Math.round(Number(rgba[2]))
    const b = Math.round(Number(rgba[3]))
    const a = rgba[4] != null ? Number(rgba[4]) : 1
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      alpha: clamp01(a),
    }
  }
  let h = v.startsWith('#') ? v.slice(1) : v
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length === 8 && /^[0-9a-f]+$/i.test(h)) {
    return {
      hex: `#${h.slice(0, 6)}`,
      alpha: clamp01(parseInt(h.slice(6, 8), 16) / 255),
    }
  }
  if (h.length === 6 && /^[0-9a-f]+$/i.test(h)) {
    return { hex: `#${h}`, alpha: 1 }
  }
  return { hex: '#ffffff', alpha: 1 }
}

/**
 * Serializa color+opacidad.
 * - alpha ≈ 1 → `#rrggbb`
 * - resto (incluido 0) → `#rrggbbaa` para no perder el color al bajar/subir opacidad
 */
export function formatColorAlpha(hex: string, alpha: number): string {
  const a = clamp01(alpha)
  const { hex: clean } = parseColorAlpha(hex)
  if (a >= 0.999) return clean
  const aa = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')
  return `${clean}${aa}`
}

export function isBackgroundTransparent(value: string): boolean {
  const { alpha } = parseColorAlpha(value)
  return alpha < 0.001
}

/** Fondo no opaco: el canvas deja ver lo que hay detrás (damero / página). */
export function isBackgroundTranslucent(value: string): boolean {
  const { alpha } = parseColorAlpha(value)
  return alpha < 0.99
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

function toHex(n: number): string {
  return Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0')
}
