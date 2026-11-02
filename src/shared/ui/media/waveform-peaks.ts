/** Waveform of an audio file: normalized peaks (0–1) and its duration. */
export type Waveform = { peaks: Array<number>; durationMs: number }

const PEAK_COUNT = 800
// Decoding at a low rate keeps a long recording a few MB in memory: plenty for a drawing.
const DECODE_SAMPLE_RATE = 8000
// Above this, decoding in a phone's browser risks getting the tab killed.
const MAX_DECODE_BYTES = 80 * 1024 * 1024

/**
 * Loudest sample of each of `count` equal slices, across channels, scaled so
 * the loudest slice is 1 (a quiet recording still draws a readable waveform).
 */
export function peaksFromChannels(channels: ReadonlyArray<Float32Array>, count = PEAK_COUNT): Array<number> {
  const length = channels[0]?.length ?? 0
  if (length === 0) return []
  const slices = Math.min(count, length)
  const peaks = new Array<number>(slices).fill(0)
  for (const channel of channels) {
    for (let i = 0; i < slices; i++) {
      const start = Math.floor((i * length) / slices)
      const end = Math.floor(((i + 1) * length) / slices)
      let max = peaks[i]!
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]!)
        if (v > max) max = v
      }
      peaks[i] = max
    }
  }
  const loudest = Math.max(...peaks)
  return peaks.map((p) => (loudest > 0 ? Math.round((p / loudest) * 100) / 100 : 0))
}

async function decode(bytes: ArrayBuffer) {
  // Some browsers refuse very low rates for an offline context: retry at a common one.
  for (const rate of [DECODE_SAMPLE_RATE, 22050]) {
    try {
      return await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.slice(0))
    } catch (error) {
      if (rate === 22050) throw error
    }
  }
  throw new Error('unreachable')
}

/** Computes the waveform of an audio file; null when the browser can't decode it (AIFF…). */
export async function computeWaveform(bytes: ArrayBuffer): Promise<Waveform | null> {
  if (typeof OfflineAudioContext === 'undefined' || bytes.byteLength > MAX_DECODE_BYTES) return null
  try {
    const buffer = await decode(bytes)
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    const peaks = peaksFromChannels(channels)
    const durationMs = Math.round(buffer.duration * 1000)
    return peaks.length > 0 && durationMs > 0 ? { peaks, durationMs } : null
  } catch {
    return null
  }
}

/** Downloads then computes the waveform of a file; null on any failure or when too big. */
export async function fetchWaveform(url: string): Promise<Waveform | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_DECODE_BYTES) {
      await res.body?.cancel()
      return null
    }
    return await computeWaveform(await res.arrayBuffer())
  } catch {
    return null
  }
}
