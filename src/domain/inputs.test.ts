import { describe, it, expect } from 'vitest'
import {
  AddEventDateInput,
  CreateGroupInput,
  CreateInviteInput,
  CreatePlaylistInput,
  ReorderPlaylistInput,
  UpdateMemberRoleInput,
  decodeInput,
} from './inputs'

// decodeInput is what server functions run on raw client payloads.
const accepts = <I,>(decoder: (data: I) => unknown, data: unknown) => {
  expect(() => decoder(data as I)).not.toThrow()
}
const rejects = <I,>(decoder: (data: I) => unknown, data: unknown) => {
  expect(() => decoder(data as I)).toThrow()
}

describe('server function inputs', () => {
  const invite = { email: 'jean@example.com', firstName: null, lastName: null, role: 'member', groupIds: [] }

  it('never lets a client assign the owner role', () => {
    rejects(decodeInput(CreateInviteInput), { ...invite, role: 'owner' })
    rejects(decodeInput(UpdateMemberRoleInput), { memberId: 'm1', role: 'owner' })
    rejects(decodeInput(UpdateMemberRoleInput), { memberId: 'm1', role: 'admin,owner' })
    accepts(decodeInput(UpdateMemberRoleInput), { memberId: 'm1', role: 'admin' })
  })

  it('validates invitation emails', () => {
    accepts(decodeInput(CreateInviteInput), invite)
    expect(decodeInput(CreateInviteInput)({ ...invite, email: '  jean@example.com ' } as never).email).toBe(
      'jean@example.com',
    )
    rejects(decodeInput(CreateInviteInput), { ...invite, email: 'not-an-email' })
    rejects(decodeInput(CreateInviteInput), { ...invite, email: 'a b@example.com' })
  })

  it('trims names and rejects blank or oversized ones', () => {
    expect(decodeInput(CreateGroupInput)({ name: '  Basses ' })).toEqual({ name: 'Basses' })
    rejects(decodeInput(CreateGroupInput), { name: '   ' })
    rejects(decodeInput(CreateGroupInput), { name: 'x'.repeat(61) })
    rejects(decodeInput(CreatePlaylistInput), { name: '', description: null })
    rejects(decodeInput(CreatePlaylistInput), { name: 'Noël', description: 'x'.repeat(2001) })
  })

  it('parses event dates and rejects garbage', () => {
    const { eventDate } = decodeInput(AddEventDateInput)({ playlistId: 'p1', eventDate: '2026-12-24T20:00:00.000Z' })
    expect(eventDate).toEqual(new Date('2026-12-24T20:00:00.000Z'))
    rejects(decodeInput(AddEventDateInput), { playlistId: 'p1', eventDate: 'tomorrow-ish' })
  })

  it('rejects wrongly typed payloads instead of passing them to the database', () => {
    rejects(decodeInput(ReorderPlaylistInput), { playlistId: 'p1', itemIdsInOrder: 'a,b' })
    rejects(decodeInput(ReorderPlaylistInput), { playlistId: { $ne: null }, itemIdsInOrder: [] })
    rejects(decodeInput(CreateGroupInput), null)
  })
})
