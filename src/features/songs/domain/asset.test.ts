import { describe, it, expect } from 'vitest'
import { safeFilename, storageKeyFor } from './asset'

describe('safeFilename', () => {
  it.each([
    ['basse.mp3', 'basse.mp3'],
    ['Ave Maria (Basse 2).pdf', 'Ave_Maria_Basse_2_.pdf'],
    ['../../etc/passwd', 'etc_passwd'],
    ['.hidden', 'hidden'],
    ['Chœur à 4 voix.mp3', 'Ch_ur_a_4_voix.mp3'],
    ['???', 'file'],
  ])('%s → %s', (input, expected) => expect(safeFilename(input)).toBe(expected))

  it('caps the length while keeping the extension', () => {
    const name = safeFilename(`${'a'.repeat(300)}.mp3`)
    expect(name.length).toBe(120)
    expect(name.endsWith('.mp3')).toBe(true)
  })
})

describe('storageKeyFor', () => {
  it('namespaces by choir and song, and never lets the file name escape it', () => {
    expect(storageKeyFor('o1', 's1', 'a1', '../../../Église é.mp3')).toBe('org/o1/song/s1/a1-Eglise_e.mp3')
  })
})
