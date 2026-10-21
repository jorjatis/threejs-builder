import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { inspectDocument } from '../src/model/inspectModel'

describe('inspectDocument', () => {
  it('inspecciona el fixture GLB real', async () => {
    const path = resolve('fixtures/tiny_planet_friends_3d-mouse-4188.glb')
    const buf = readFileSync(path)
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS)
    const doc = await io.readBinary(new Uint8Array(buf))
    const stats = inspectDocument(doc, {
      fileName: 'tiny_planet_friends_3d-mouse-4188.glb',
      fileSizeBytes: buf.byteLength,
      format: 'glb',
    })
    expect(stats.meshes.value).toBeGreaterThan(0)
    expect(stats.triangles.value).toBeGreaterThan(0)
    expect(stats.fileSizeBytes).toBe(buf.byteLength)
  }, 60_000)
})
