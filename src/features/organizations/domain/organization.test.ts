import { describe, it, expect } from 'vitest'
import { Either, Schema } from 'effect'
import { CreateOrganizationForm, CreateOrganizationInput } from './organization'

describe('organization names', () => {
  it('are bounded', () => {
    const decode = Schema.decodeUnknownEither(CreateOrganizationInput)
    expect(Either.isLeft(decode({ name: 'A' }))).toBe(true)
    expect(Either.isRight(decode({ name: 'Chorale' }))).toBe(true)
    expect(Either.isLeft(decode({ name: 'x'.repeat(81) }))).toBe(true)
  })

  it('report French messages in the form', async () => {
    const result = (await CreateOrganizationForm['~standard'].validate({ name: 'A' })) as { issues?: Array<{ message: string }> }
    expect(result.issues?.map((i) => i.message)).toEqual(['Le nom doit faire au moins 2 caractères'])
  })
})
