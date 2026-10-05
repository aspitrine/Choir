import { describe, it, expect } from 'vitest'
import { buildBundles, formatAudience, type SharedAsset, type SharedItem } from './share-bundles'

const soprano = { id: 'g-sop', name: 'Soprano' }
const basse = { id: 'g-bas', name: 'Basse' }
const alto = { id: 'g-alt', name: 'Alto' }

let n = 0
function asset(overrides: Partial<SharedAsset> = {}): SharedAsset {
  n += 1
  return {
    id: `a${n}`,
    kind: 'audio',
    label: null,
    mimeType: 'audio/mpeg',
    status: 'ready',
    groups: [],
    url: `https://s3.test/a${n}`,
    ...overrides,
  }
}

const song = (title: string, assets: Array<SharedAsset>): SharedItem => ({
  song: { id: title, title },
  assets,
})

describe('formatAudience', () => {
  it('names everyone when no group is set', () => {
    expect(formatAudience([])).toBe('Tout le monde')
  })

  it('joins names in French', () => {
    expect(formatAudience(['Soprano'])).toBe('Soprano')
    expect(formatAudience(['Soprano', 'Basse'])).toBe('Soprano et Basse')
    expect(formatAudience(['Soprano', 'Alto', 'Basse'])).toBe('Soprano, Alto et Basse')
  })
})

describe('buildBundles', () => {
  it('returns nothing when there is no playable file', () => {
    expect(buildBundles([])).toEqual([])
    expect(buildBundles([song('Vide', [])])).toEqual([])
  })

  it('groups files by the exact set of groups they are shared with', () => {
    const bundles = buildBundles([
      song('Ave', [
        asset({ groups: [] }),
        asset({ groups: [soprano, basse] }),
        asset({ groups: [basse] }),
        asset({ groups: [alto] }),
      ]),
    ])
    expect(bundles.map((b) => b.audience)).toEqual([
      'Tout le monde',
      'Alto',
      'Basse',
      'Soprano et Basse',
    ])
  })

  it('treats the same groups in a different order as one bundle', () => {
    const bundles = buildBundles([
      song('A', [asset({ groups: [soprano, basse] })]),
      song('B', [asset({ groups: [basse, soprano] })]),
    ])
    expect(bundles).toHaveLength(1)
    expect(bundles[0]!.tracks.map((t) => t.title)).toEqual(['A', 'B'])
  })

  it('keeps playlist order and splits tracks from PDFs', () => {
    const [bundle] = buildBundles([
      song('Premier', [asset(), asset({ kind: 'score', mimeType: 'application/pdf', label: 'Chœur' })]),
      song('Second', [asset({ label: 'Basse 2' })]),
    ])
    expect(bundle!.tracks.map((t) => [t.title, t.label])).toEqual([
      ['Premier', null],
      ['Second', 'Basse 2'],
    ])
    expect(bundle!.scores.map((s) => [s.title, s.label])).toEqual([['Premier', 'Chœur']])
  })

  it('skips files that are not ready or are non-PDF scores', () => {
    const bundles = buildBundles([
      song('X', [
        asset({ status: 'uploading' }),
        asset({ status: 'failed' }),
        asset({ kind: 'score', mimeType: 'image/png' }),
      ]),
    ])
    expect(bundles).toEqual([])
  })

  it('creates a bundle with only PDFs when no audio is shared to that group', () => {
    const [bundle] = buildBundles([
      song('X', [asset({ kind: 'score', mimeType: 'application/pdf', groups: [alto] })]),
    ])
    expect(bundle!.audience).toBe('Alto')
    expect(bundle!.tracks).toEqual([])
    expect(bundle!.scores).toHaveLength(1)
  })
})
