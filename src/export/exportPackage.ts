import JSZip from 'jszip'
import type { Document } from '@gltf-transform/core'
import type { ExportSettings, ModelStats, SceneConfig } from '../types'
import { exportModelDocument } from './exportModel'
import { generateJsModule, generateReadme } from './generateJsModule'
import { downloadBlob } from '../utils/download'
import { formatBytes, reductionPercent } from '../utils/format'

export async function exportFullPackage(opts: {
  document: Document
  settings: ExportSettings
  scene: SceneConfig
  projectName: string
  originalStats: ModelStats | null
  currentStats: ModelStats | null
  originalSize: number
  currentSize: number
  appliedOps: string[]
}): Promise<void> {
  const zip = new JSZip()
  const base = opts.settings.fileName.replace(/\.(glb|gltf|zip)$/i, '')
  let modelFileName = `${base}.glb`

  if (opts.settings.includeModel) {
    const model = await exportModelDocument(opts.document, opts.settings.format, base)
    if (opts.settings.format === 'glb') {
      zip.file(model.fileName, model.blob)
      modelFileName = model.fileName
    } else {
      // El export gltf ya es un zip interno; lo desembalamos
      const inner = await JSZip.loadAsync(model.blob)
      for (const [path, file] of Object.entries(inner.files)) {
        if (!file.dir) {
          zip.file(`model/${path}`, await file.async('uint8array'))
        }
      }
      modelFileName = `model/${base}.gltf`
    }
  }

  // Ruta relativa correcta dentro del zip
  const modelRef = opts.settings.format === 'glb' ? modelFileName : `${base}.gltf`
  const modFixed = generateJsModule(
    opts.settings.jsMode,
    opts.scene,
    modelRef.split('/').pop() ?? modelRef,
  )

  if (opts.settings.includeJsModule) {
    zip.file(modFixed.fileName, modFixed.code)
  }

  const report = [
    `# Informe de optimización`,
    ``,
    `- Original: ${formatBytes(opts.originalSize)}`,
    `- Actual: ${formatBytes(opts.currentSize)}`,
    `- Reducción: ${reductionPercent(opts.originalSize, opts.currentSize).toFixed(1)}%`,
    `- Triángulos: ${opts.originalStats?.triangles.value ?? '—'} → ${opts.currentStats?.triangles.value ?? '—'}`,
    `- Operaciones: ${opts.appliedOps.join(', ') || '(ninguna)'}`,
  ].join('\n')

  if (opts.settings.includeReport) {
    zip.file('optimization-report.md', report)
  }

  if (opts.settings.includeReadme) {
    zip.file(
      'README.md',
      generateReadme({
        projectName: opts.projectName,
        modelFileName: modelRef,
        mode: opts.settings.jsMode,
        module: modFixed,
        report,
      }),
    )
  }

  if (opts.settings.includeExample) {
    if (opts.settings.jsMode === 'standalone') {
      zip.file(
        'example.html',
        `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${opts.projectName}</title>
  <style>
    html,body{margin:0;height:100%;background:#111;color:#eee;font-family:system-ui,sans-serif}
    #viewer{width:100%;height:100vh}
    .credits{position:fixed;left:12px;bottom:12px;font-size:12px;opacity:.7}
  </style>
</head>
<body>
  <div id="viewer" role="img" aria-label="${opts.scene.editorial.altText || opts.projectName}"></div>
  ${opts.scene.editorial.creditsEnabled ? `<div class="credits">${opts.scene.editorial.credits}</div>` : ''}
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.180.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.180.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import { createModelViewer } from './${modFixed.fileName}';
    const viewer = createModelViewer(document.getElementById('viewer'));
    await viewer.ready;
  </script>
</body>
</html>
`,
      )
    } else {
      zip.file(
        'INTEGRATION.md',
        modFixed.instructions +
          '\n\nColoca el GLB junto al módulo y asegúrate de que tu bundler resuelva `three`.\n',
      )
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${base}-paquete.zip`)
}
