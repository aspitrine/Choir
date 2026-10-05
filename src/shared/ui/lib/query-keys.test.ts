import { describe, it, expect } from 'vitest'
import { matchQuery } from '@tanstack/react-query'
import { groupKeys } from '@/features/groups/ui/keys'
import { memberKeys } from '@/features/members/ui/keys'
import { playlistKeys } from '@/features/playlists/ui/keys'
import { publicKeys } from '@/features/sharing/ui/keys'
import { sessionKeys } from '@/features/auth/ui/keys'
import { songKeys } from '@/features/songs/ui/keys'

// Invalidation works by key prefix: these checks pin the hierarchy mutations rely on,
// including across features (e.g. deleting a group refetches songs and playlists).
const covers = (prefix: ReadonlyArray<unknown>, key: ReadonlyArray<unknown>) =>
  matchQuery({ queryKey: prefix }, { queryKey: key, queryHash: JSON.stringify(key) } as never)

describe('query keys', () => {
  it('songKeys.all covers lists and details; lists() spares details', () => {
    const list = songKeys.list({ q: 'ave', page: 2 })
    const detail = songKeys.detail('s1')
    expect(covers(songKeys.all, list)).toBe(true)
    expect(covers(songKeys.all, detail)).toBe(true)
    expect(covers(songKeys.lists(), detail)).toBe(false)
  })

  it('share links live under their playlist detail, which lives under playlists', () => {
    expect(covers(playlistKeys.detail('p1'), playlistKeys.shareLinks('p1'))).toBe(true)
    expect(covers(playlistKeys.all, playlistKeys.upcoming())).toBe(true)
    expect(covers(playlistKeys.detail('p1'), playlistKeys.detail('p2'))).toBe(false)
  })

  it('keeps domains apart', () => {
    const roots = [songKeys.all, playlistKeys.all, groupKeys.all, memberKeys.all, publicKeys.all, sessionKeys.all]
    expect(new Set(roots.map((k) => k[0])).size).toBe(roots.length)
    expect(covers(memberKeys.all, memberKeys.invitations({ q: '', page: 1 }))).toBe(true)
  })

  it('scopes public asset URLs to their share token', () => {
    expect(covers(publicKeys.playlist('t1'), publicKeys.assetUrls('t1', ['a']))).toBe(true)
    expect(covers(publicKeys.playlist('t2'), publicKeys.assetUrls('t1', ['a']))).toBe(false)
  })
})
