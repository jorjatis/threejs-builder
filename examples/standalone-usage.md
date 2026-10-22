# Visor autónomo

```html
<div id="viewer" style="width:100%;height:480px;"></div>
<script type="module">
  import { createModelViewer } from './createModelViewer.js'
  const viewer = createModelViewer(document.getElementById('viewer'))
  await viewer.ready
  // viewer.dispose()
</script>
```

Requiere que el bundler o import map resuelva `three` y `three/addons/*`.
