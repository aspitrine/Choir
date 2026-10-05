import { describe, it, expect } from 'vitest'
import { CreateGroupForm, slugify } from './group'

describe('slugify', () => {
  it.each([
    ['Sopranes Élèves !', 'sopranes-eleves'],
    ['  Basses 2 ', 'basses-2'],
    ['!!!', 'groupe'],
  ])('%s → %s', (name, slug) => expect(slugify(name)).toBe(slug))
})

describe('CreateGroupForm', () => {
  it('reports French messages', async () => {
    const issues = async (value: unknown) =>
      (((await CreateGroupForm['~standard'].validate(value)) as { issues?: Array<{ message: string }> }).issues ?? []).map(
        (i) => i.message,
      )
    expect(await issues({ name: 'A' })).toEqual(['Le nom doit faire au moins 2 caractères'])
    expect(await issues({ name: 'x'.repeat(61) })).toEqual(['Le nom est trop long'])
    expect(await issues({ name: 'Basses' })).toEqual([])
  })
})
