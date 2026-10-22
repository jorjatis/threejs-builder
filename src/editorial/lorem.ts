/** Párrafos lorem de varias líneas para el mock de artículo. */
const LOREM_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.',
  'Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi.',
  'Nam enim risus, molestie et, porta ac, aliquam vitae, libero. Aenean placerat. In vulputate urna eu arcu. Aliquam erat volutpat. Suspendisse potenti. Pellentesque egestas, neque sit amet convallis pulvinar.',
  'Morbi a metus. Phasellus enim erat, vestibulum vel, aliquam a, posuere eu, velit. Nullam sapien sem, ornare ac, nonummy non, lobortis a, enim. Nunc tincidunt interdum neque. Vestibulum ante ipsum primis in faucibus.',
  'Proin vulputate leo vitae orci. Aenean magna nisl, mollis quis, molestie eu, feugiat in, orci. In hac habitasse platea dictumst. Integer at risus. Morbi non magna nec lorem tincidunt tempus. Vivamus euismod nisl.',
  'Fusce et lorem. Curae; Duis sit amet nisl. Vestibulum auctor. Sed viverra, urna sit amet laoreet dictum, ipsum leo aliquam libero, non tincidunt arcu justo sit amet enim. Donec at nulla. Mauris velit.',
]

const MIN_PARAGRAPHS = 1
const MAX_PARAGRAPHS = 20

export function clampParagraphCount(n: number): number {
  if (!Number.isFinite(n)) return 2
  return Math.max(MIN_PARAGRAPHS, Math.min(MAX_PARAGRAPHS, Math.round(n)))
}

/** Devuelve `count` párrafos lorem (cíclicos si hace falta). */
export function getLoremParagraphs(count: number): string[] {
  const n = clampParagraphCount(count)
  if (n <= 0) return []
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(LOREM_PARAGRAPHS[i % LOREM_PARAGRAPHS.length]!)
  }
  return out
}

export { MIN_PARAGRAPHS, MAX_PARAGRAPHS }
