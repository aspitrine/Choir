import { describe, it, expect } from 'vitest'
import { peaksFromChannels } from './waveform-peaks'

describe('peaksFromChannels', () => {
  it('keeps the loudest sample of each slice, across channels, scaled to 1', () => {
    const left = new Float32Array([0.1, -0.2, 0.05, 0.1])
    const right = new Float32Array([0, 0.1, -0.4, 0])
    expect(peaksFromChannels([left, right], 2)).toEqual([0.5, 1])
  })

  it('never makes more slices than samples, and handles silence and empty input', () => {
    expect(peaksFromChannels([new Float32Array([0.5, 0.25])], 10)).toEqual([1, 0.5])
    expect(peaksFromChannels([new Float32Array(4)], 2)).toEqual([0, 0])
    expect(peaksFromChannels([])).toEqual([])
  })
})
