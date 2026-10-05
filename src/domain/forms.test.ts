import { describe, it, expect } from 'vitest'
import { CreateGroupForm } from './groups'
import { CreateSongForm } from './songs'
import { CreateOrganizationForm } from './organization'

// Standard Schema adapters consumed by TanStack Form: the messages are user-facing.
async function issues(schema: { '~standard': { validate: (v: unknown) => unknown } }, value: unknown) {
  const result = (await schema['~standard'].validate(value)) as { issues?: Array<{ message: string }> }
  return result.issues?.map((i) => i.message) ?? []
}

describe('form schemas', () => {
  it('reports French messages for group names', async () => {
    expect(await issues(CreateGroupForm, { name: 'A' })).toEqual(['Le nom doit faire au moins 2 caractères'])
    expect(await issues(CreateGroupForm, { name: 'x'.repeat(61) })).toEqual(['Le nom est trop long'])
    expect(await issues(CreateGroupForm, { name: 'Basses' })).toEqual([])
  })

  it('requires a song title', async () => {
    const empty = { title: '', composer: '', arranger: '', key: '', tempo: '' }
    expect(await issues(CreateSongForm, empty)).toEqual(['Le titre est requis'])
    expect(await issues(CreateSongForm, { ...empty, title: 'Ave' })).toEqual([])
  })

  it('validates organization names', async () => {
    expect(await issues(CreateOrganizationForm, { name: 'A' })).toEqual([
      'Le nom doit faire au moins 2 caractères',
    ])
  })
})
