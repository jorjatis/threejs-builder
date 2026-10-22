export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  mime = 'application/octet-stream',
): void {
  downloadBlob(new Blob([buffer], { type: mime }), fileName)
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
