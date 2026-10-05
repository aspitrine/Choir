import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { attempt } from './attempt'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

beforeEach(() => vi.mocked(toast.error).mockClear())

describe('attempt', () => {
  it('resolves true when the action succeeds', async () => {
    expect(await attempt(async () => 'ok', 'Oups')).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('swallows the failure, shows the message and resolves false', async () => {
    expect(await attempt(() => Promise.reject(new Error('internal detail')), 'Suppression impossible')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Suppression impossible')
  })
})
