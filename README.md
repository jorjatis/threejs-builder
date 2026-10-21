# threejs-builder

Editor y optimizador **local** de modelos 3D (glTF / GLB). Todo el procesamiento ocurre en el navegador: no se suben modelos a servidores externos.

## Requisitos

- Node.js 20+
- Navegador con WebGL2 y soporte razonable de WebAssembly / Canvas

## Instalación y comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # comprobación TypeScript + bundle
npm run preview  # sirve el build
npm test         # pruebas unitarias / integración
npm run lint
```

## Arquitectura

```
src/
  app/            # shell, paneles, navegación
  viewer/         # ciclo de vida Three.js (singleton)
  model/          # importación e inspección glTF
  textures/       # inventario y operaciones de texturas
  optimization/   # pipeline glTF Transform (sencillo + avanzado)
  scene-config/   # defaults y presets editoriales
  export/         # GLB/GLTF, módulos JS, ZIP
  projects/       # guardar / abrir / portable
  storage/        # IndexedDB
  store/          # estado Zustand + sesión binaria fuera de React
  types/ utils/
```

### Separación de estado

1. **Original** — `session.originalGlb` intacto
2. **Trabajo** — `session.workingGlb` + documento glTF Transform
3. **Optimización** — switches / pipeline JSON
4. **Última válida** — `session.lastValidGlb`
5. **Escena** — cámara, luces, contenedor, editorial
6. **Exportación** — formato y opciones de paquete
7. **Historial** — snapshots GLB controlados (undo/redo)
8. **Proyecto** — IndexedDB / `.tbproj.zip`

## Flujo de trabajo

1. Importa `.glb` o `.gltf` (+ recursos) por botón o drag & drop
2. Inspecciona estadísticas reales y texturas
3. Optimiza (modo sencillo o pipeline JSON avanzado)
4. Configura escena editorial (cámara, interacción, luces, contenedor)
5. Exporta GLB/GLTF, módulo JS (integración o autónomo) o ZIP completo
6. Opcionalmente guarda el proyecto en IndexedDB

## Optimización real (navegador)

Basada en [@gltf-transform](https://gltf-transform.dev/) + `meshoptimizer` + Draco WASM (`public/draco/`):

| Operación | Notas |
|-----------|--------|
| dedup / prune / flatten / join / weld / reorder | Sin pérdida de calidad visual relevante |
| simplify | MeshoptSimplifier (con pérdida) |
| textureResize / textureCompress | Encoder Canvas del navegador (no Sharp) |
| meshopt | `EXT_meshopt_compression` (recomendado en navegador) |
| draco | **Sí** — encoding/decoding con WASM en el navegador (`public/draco/`). No combinar con Meshopt. Al publicar usa `DRACOLoader`. |

Usa Meshopt como estrategia de compresión de geometría en esta herramienta.

### Modo avanzado

Acepta un **pipeline JSON validado**, no JavaScript arbitrario (`eval` / `new Function` no se usan). Operaciones permitidas = misma API que el modo sencillo.

## Exportación JavaScript

- **Modo A — integrar:** `createModelScene({ scene, camera, renderer, domElement, config })` — no crea renderer ni rAF
- **Modo B — autónomo:** `createModelViewer(container, config)` — crea y destruye su ciclo

Ver `examples/integrate-usage.md` y `examples/standalone-usage.md`.

## Modelos de prueba

Incluido (uso interno / fixture):

- `fixtures/tiny_planet_friends_3d-mouse-4188.glb` (~24 MB, ~500k triángulos)

Otros modelos con licencia clara: [Khronos sample models](https://github.com/KhronosGroup/glTF-Sample-Models), [Poly Pizza](https://poly.pizza/), etc.

## Limitaciones conocidas

- **KTX2 / Basis encoding** no está integrado (requeriría WASM encoder adicional y pipeline de carga KTX2 en el visor). La compresión de texturas usa WebP/JPEG/PNG vía Canvas.
- Restaurar una textura individual eliminada recupera desde el **modelo original** (se pierden optimizaciones posteriores en ese paso).
- El historial guarda snapshots GLB; modelos muy grandes pueden agotar memoria del navegador.
- Cuotas de IndexedDB: si se superan, exporta un proyecto portable ZIP.
- El ejemplo HTML del ZIP usa un import map a unpkg solo como demo; en producción resuelve `three` desde tu bundler.

## Privacidad

- Sin telemetría
- Sin subida de assets
- Decoders Draco del visor empaquetados en `public/draco/`
- Fuentes IBM Plex empaquetadas vía `@fontsource/*`

## Funcionalidades implementadas

- [x] Importación GLB / glTF multiarchivo
- [x] Visor Three.js con órbita, vistas, grid/ejes
- [x] Estadísticas e inspección
- [x] Inventario de texturas, resize, eliminar, restaurar (desde original)
- [x] Optimización sencilla + avanzada (pipeline JSON)
- [x] Consola, progreso, cancelación (AbortSignal)
- [x] Configurador de escena + presets
- [x] Panel de rendimiento y presupuesto
- [x] Export GLB / glTF ZIP / módulo JS / paquete completo
- [x] Proyectos IndexedDB + portable ZIP
- [x] Undo/redo por snapshots
- [x] Pruebas vitest de utilidades, pipeline e inspección

## Pendiente / mejoras futuras

- [ ] Codificación KTX2/Basis en navegador
- [ ] Worker dedicado para pipelines muy pesados (UI ya no bloquea del todo, pero el transform corre en el hilo principal)
- [ ] Restauración quirúrgica de texturas sin reset al original
- [ ] HDRI local empaquetado para entorno PBR
- [ ] Pruebas E2E automatizadas del flujo completo en navegador
