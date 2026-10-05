import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createQueryClient } from '@/shared/ui/lib/query-client'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
beforeEach(() => vi.mocked(toast.error).mockClear())

const mutate = (
  client: ReturnType<typeof createQueryClient>,
  mutationFn: () => Promise<unknown>,
  meta?: { errorMessage?: string; invalidates?: Array<ReadonlyArray<unknown>> },
) => new MutationObserver(client, { mutationFn, meta, retry: false }).mutate()

describe('createQueryClient', () => {
  it('creates an isolated cache per call (one per SSR request)', () => {
    const a = createQueryClient()
    const b = createQueryClient()
    a.setQueryData(['songs'], ['secret'])
    expect(b.getQueryData(['songs'])).toBeUndefined()
  })

  it('refetches the queries listed in meta.invalidates before the mutation resolves', async () => {
    const client = createQueryClient()
    let version = 0
    const fetchSongs = vi.fn(async () => ++version)
    // An active observer, like a mounted component.
    const observer = new QueryObserver(client, { queryKey: ['songs', 'list', { q: '', page: 1 }], queryFn: fetchSongs })
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(1))
    client.setQueryData(['playlists'], 'untouched')

    await mutate(client, async () => 'ok', { invalidates: [['songs']] })

    expect(observer.getCurrentResult().data).toBe(2)
    expect(client.getQueryState(['playlists'])?.isInvalidated).toBe(false)
    unsubscribe()
  })

  it('toasts meta.errorMessage on failure, and stays quiet without it', async () => {
    const client = createQueryClient()
    await expect(mutate(client, () => Promise.reject(new Error('boom')), { errorMessage: 'Suppression impossible' })).rejects.toThrow()
    expect(toast.error).toHaveBeenCalledWith('Suppression impossible')

    vi.mocked(toast.error).mockClear()
    await expect(mutate(client, () => Promise.reject(new Error('boom')))).rejects.toThrow()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not invalidate anything when the mutation fails', async () => {
    const client = createQueryClient()
    client.setQueryData(['songs'], 'cached')
    await expect(mutate(client, () => Promise.reject(new Error('x')), { invalidates: [['songs']] })).rejects.toThrow()
    expect(client.getQueryState(['songs'])?.isInvalidated).toBe(false)
  })
})
