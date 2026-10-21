import { describe, expect, it } from 'vitest'
import { formatBytes, reductionPercent } from '../src/utils/format'
import { validatePipelineSteps } from '../src/optimization/operations'
import { settingsToSteps } from '../src/optimization/runOptimization'
import { createDefaultOptimizationSettings } from '../src/scene-config/defaults'

describe('formatBytes', () => {
  it('formatea bytes legibles', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })
})

describe('reductionPercent', () => {
  it('calcula reducción respecto al original', () => {
    expect(reductionPercent(100, 40)).toBe(60)
    expect(reductionPercent(100, 150)).toBe(-50)
  })
})

describe('pipeline validation', () => {
  it('rechaza meshopt + draco juntos', () => {
    const r = validatePipelineSteps([{ op: 'meshopt' }, { op: 'draco' }])
    expect(r.ok).toBe(false)
  })

  it('acepta pipeline sencillo', () => {
    const r = validatePipelineSteps([{ op: 'dedup' }, { op: 'prune' }])
    expect(r.ok).toBe(true)
  })
})

describe('settingsToSteps', () => {
  it('respeta el orden canónico y flags', () => {
    const s = createDefaultOptimizationSettings()
    for (const op of s.ops) {
      if (op.id === 'dedup' || op.id === 'prune') op.enabled = true
    }
    const steps = settingsToSteps(s)
    expect(steps.map((x) => x.op)).toEqual(['dedup', 'prune'])
  })
})
