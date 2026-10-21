# Funcionalidades

## Implementadas

| Área | Detalle |
|------|---------|
| Importación | `.glb`, `.gltf` + recursos externos, botón y drag & drop |
| Visor | Three.js, órbita, vistas, grid/ejes, encuadre, un solo rAF |
| Estadísticas | Exactas desde glTF Transform + draw calls medidos en escena |
| Texturas | Inventario, miniaturas, usos, resize, eliminar, restaurar desde original |
| Optimización sencilla | Switches reales → pipeline desde el original |
| Optimización avanzada | Pipeline JSON validado (sin JS arbitrario) |
| Consola | Logs reales, filtros, copiar, cancelación AbortSignal |
| Escena | Cámara, interacción, auto-rotación, luces, contenedor, editorial, presets |
| Rendimiento | Presupuesto, alertas confirmadas/heurísticas |
| Export modelo | GLB y glTF+ZIP con validación de reimportación |
| Export JS | Modo integrar (`createModelScene`) y autónomo (`createModelViewer`) |
| Paquete ZIP | Modelo + módulo + README + ejemplo + informe |
| Proyectos | IndexedDB, portable `.tbproj.zip`, undo/redo por snapshots |
| Privacidad | 100% local, sin telemetría, Draco decoder vendored |

## Limitaciones documentadas

| Ítem | Estado |
|------|--------|
| Encoding Draco | Sí (WASM en `public/draco/`). Incompatible con Meshopt en el mismo GLB |
| KTX2/Basis encode | No integrado |
| Restaurar textura individual | Recupera desde el GLB original (pierde ops posteriores) |
| Worker pesado dedicado | Pipeline en hilo principal (con progreso/cancelación) |
| HDRI empaquetado | No incluido; fondo sólido configurable |

## Cómo probar rápido

```bash
npm install
npm run dev
```

1. Arrastra `fixtures/tiny_planet_friends_3d-mouse-4188.glb`
2. Revisa estadísticas en **Modelo**
3. Activa `dedup` / `prune` / `textureResize` en **Optimización**
4. Ajusta auto-rotación en **Escena**
5. Exporta GLB + módulo JS en **Exportación**
