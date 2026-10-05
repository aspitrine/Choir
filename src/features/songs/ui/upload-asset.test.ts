import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmUploadFn, createUploadIntentFn, deleteAssetFn } from '@/features/songs/server/assets.functions'
import { uploadAsset } from '@/features/songs/ui/upload-asset'

vi.mock('@/features/songs/server/assets.functions', () => ({
  createUploadIntentFn: vi.fn(),
  confirmUploadFn: vi.fn(),
  deleteAssetFn: vi.fn(),
}))

const file = new File(['ID3'], 'Basse 2.mp3', { type: 'audio/mpeg' })
const input = { songId: 's1', file, label: 'Basse 2', groupIds: ['g1'] }
const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(createUploadIntentFn).mockResolvedValue({ assetId: 'a1', uploadUrl: 'https://s3.test/put' } as never)
  vi.mocked(deleteAssetFn).mockResolvedValue(undefined)
})

describe('uploadAsset', () => {
  it('reserves, sends the bytes to storage, then confirms', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    vi.mocked(confirmUploadFn).mockResolvedValue({ id: 'a1', status: 'ready' } as never)

    await expect(uploadAsset(input)).resolves.toMatchObject({ id: 'a1' })
    expect(createUploadIntentFn).toHaveBeenCalledWith({
      data: {
        songId: 's1',
        kind: 'audio',
        label: 'Basse 2',
        filename: 'Basse 2.mp3',
        contentType: 'audio/mpeg',
        groupIds: ['g1'],
      },
    })
    expect(fetchMock).toHaveBeenCalledWith('https://s3.test/put', {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'audio/mpeg' },
    })
    expect(confirmUploadFn).toHaveBeenCalledWith({ data: { assetId: 'a1' } })
    expect(deleteAssetFn).not.toHaveBeenCalled()
  })

  it('deletes the pending asset when storage refuses the bytes', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))
    await expect(uploadAsset(input)).rejects.toThrow('403')
    expect(confirmUploadFn).not.toHaveBeenCalled()
    expect(deleteAssetFn).toHaveBeenCalledWith({ data: { assetId: 'a1' } })
  })

  it('deletes the pending asset when confirmation fails, and keeps the original error', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    vi.mocked(confirmUploadFn).mockRejectedValue(new Error('head failed'))
    vi.mocked(deleteAssetFn).mockRejectedValue(new Error('cleanup failed too'))
    await expect(uploadAsset(input)).rejects.toThrow('head failed')
    expect(deleteAssetFn).toHaveBeenCalled()
  })

  it('has nothing to clean up when the reservation itself fails', async () => {
    vi.mocked(createUploadIntentFn).mockRejectedValue(new Error('forbidden'))
    await expect(uploadAsset(input)).rejects.toThrow('forbidden')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deleteAssetFn).not.toHaveBeenCalled()
  })
})
