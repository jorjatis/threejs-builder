import type { ArticlePreviewWidth } from '../types'

/** Tamaños simulados del mock de artículo (viewport). Desktop = fluido. */
export const ARTICLE_PREVIEW_SIZES: Record<
  Exclude<ArticlePreviewWidth, '100%'>,
  { width: number; height: number }
> = {
  1024: { width: 1024, height: 840 },
  699: { width: 699, height: 760 },
  375: { width: 375, height: 667 },
  320: { width: 320, height: 568 },
}

export function getArticlePreviewSize(w: ArticlePreviewWidth): {
  width: number | '100%'
  height: number | null
} {
  if (w === '100%') return { width: '100%', height: null }
  const s = ARTICLE_PREVIEW_SIZES[w]
  return { width: s.width, height: s.height }
}
