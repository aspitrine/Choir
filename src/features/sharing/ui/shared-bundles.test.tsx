// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, fireEvent, cleanup, waitFor, within, act } from '@testing-library/react'
import { PDFDocument } from 'pdf-lib'
import type { SharedAsset, SharedItem } from '@/features/sharing/domain/share-bundles'
import { SharedBundles } from '@/features/sharing/ui/shared-bundles'
import { renderWithQuery } from '@/test/render'

const getPublicAssetUrlsFn = vi.hoisted(() => vi.fn())
vi.mock('@/features/sharing/server/sharing.functions', () => ({ getPublicAssetUrlsFn }))
// react-pdf needs a canvas/worker; the viewer itself is out of scope here.
vi.mock('@/shared/ui/media/pdf-viewer', () => ({
  PdfViewer: ({ url }: { url: string }) => <div data-testid="pdf-viewer">{url}</div>,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const basse = { id: 'g-bas', name: 'Basse' }
const soprano = { id: 'g-sop', name: 'Soprano' }

const asset = (id: string, overrides: Partial<SharedAsset> = {}): SharedAsset => ({
  id,
  kind: 'audio',
  label: null,
  mimeType: 'audio/mpeg',
  status: 'ready',
  groups: [],
  url: `https://s3.test/${id}`,
  ...overrides,
})
const item = (title: string, assets: Array<SharedAsset>): SharedItem => ({ song: { id: title, title }, assets })

const audio = () => document.querySelector('audio')!

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  getPublicAssetUrlsFn.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SharedBundles', () => {
  it('renders nothing without shared audio or PDF', () => {
    const { container } = renderWithQuery(
      <SharedBundles token="t" items={[item('Vide', [asset('x', { status: 'uploading' })])]} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows one block per audience, with player and PDF button only when relevant', () => {
    renderWithQuery(
      <SharedBundles
        token="t"
        items={[
          item('Ave', [
            asset('a1'),
            asset('a2', { groups: [soprano, basse] }),
            asset('p1', { kind: 'score', mimeType: 'application/pdf', groups: [basse] }),
          ]),
        ]}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Tout le monde', 'Basse', 'Soprano et Basse'])

    const block = (name: string) => screen.getByRole('heading', { name }).closest('div.rounded-md') as HTMLElement
    expect(block('Tout le monde').querySelector('audio')).not.toBeNull()
    expect(within(block('Tout le monde')).queryByRole('button', { name: /Partitions/ })).toBeNull()
    expect(block('Basse').querySelector('audio')).toBeNull()
    expect(within(block('Basse')).getByRole('button', { name: 'Partitions (1 PDF)' })).toBeTruthy()
  })

  it('chains tracks and loops back to the first one', () => {
    renderWithQuery(<SharedBundles token="t" items={[item('Un', [asset('a1')]), item('Deux', [asset('a2')])]} />)
    expect(audio().getAttribute('src')).toBe('https://s3.test/a1')
    expect(screen.getByText(/1 \/ 2 · Un/)).toBeTruthy()

    fireEvent.ended(audio())
    expect(audio().getAttribute('src')).toBe('https://s3.test/a2')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()

    fireEvent.ended(audio())
    expect(audio().getAttribute('src')).toBe('https://s3.test/a1')
  })

  it('loops a single track natively', () => {
    renderWithQuery(<SharedBundles token="t" items={[item('Seul', [asset('a1')])]} />)
    expect(audio().loop).toBe(true)
  })

  it('jumps to a track from the list and with previous/next', () => {
    renderWithQuery(
      <SharedBundles token="t" items={[item('Un', [asset('a1')]), item('Deux', [asset('a2')]), item('Trois', [asset('a3')])]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Trois/ }))
    expect(audio().getAttribute('src')).toBe('https://s3.test/a3')
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(audio().getAttribute('src')).toBe('https://s3.test/a1')
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(audio().getAttribute('src')).toBe('https://s3.test/a3')
  })

  it('refreshes expired URLs once, then skips a broken track', async () => {
    getPublicAssetUrlsFn.mockResolvedValue({ a1: 'https://s3.test/a1-fresh', a2: 'https://s3.test/a2-fresh' })
    renderWithQuery(<SharedBundles token="tok" items={[item('Un', [asset('a1')]), item('Deux', [asset('a2')])]} />)

    fireEvent.error(audio())
    await waitFor(() => expect(audio().getAttribute('src')).toBe('https://s3.test/a1-fresh'))
    expect(getPublicAssetUrlsFn).toHaveBeenCalledWith({ data: { token: 'tok', assetIds: ['a1', 'a2'] } })

    fireEvent.error(audio())
    await waitFor(() => expect(audio().getAttribute('src')).toBe('https://s3.test/a2-fresh'))
    expect(getPublicAssetUrlsFn).toHaveBeenCalledTimes(1)
  })

  it('merges every PDF of a bundle into one document', async () => {
    const pdf = async (pages: number) => {
      const doc = await PDFDocument.create()
      for (let i = 0; i < pages; i++) doc.addPage()
      return doc.save()
    }
    const files: Record<string, Uint8Array> = {
      'https://fresh/p1': await pdf(1),
      'https://fresh/p2': await pdf(2),
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (url) => new Response(files[String(url)] as BodyInit, { status: 200 }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:merged')
    URL.revokeObjectURL = vi.fn()
    getPublicAssetUrlsFn.mockResolvedValue({ p1: 'https://fresh/p1', p2: 'https://fresh/p2' })

    const score = { kind: 'score' as const, mimeType: 'application/pdf' }
    renderWithQuery(
      <SharedBundles token="tok" items={[item('Un', [asset('p1', score)]), item('Deux', [asset('p2', score)])]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Partitions (2 PDF)' }))

    expect(await screen.findByText(/2 partitions · 3 pages/)).toBeTruthy()
    expect(screen.getByTestId('pdf-viewer').textContent).toBe('blob:merged')
    expect(screen.getByRole('link', { name: 'Télécharger' }).getAttribute('download')).toBe(
      'Partitions - Tout le monde.pdf',
    )
  })

  it('pauses the other playlists when one starts', () => {
    renderWithQuery(
      <SharedBundles
        token="t"
        items={[item('Ave', [asset('a1'), asset('a2', { groups: [basse] })])]}
      />,
    )
    const [everyone, bass] = Array.from(document.querySelectorAll('audio'))
    Object.defineProperty(everyone!, 'paused', { value: false, configurable: true })
    Object.defineProperty(bass!, 'paused', { value: false, configurable: true })

    fireEvent.play(bass!)
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)
    expect(pause.mock.contexts).toEqual([everyone])
  })

  it('gives lock-screen controls to the playlist being played', () => {
    const handlers = new Map<string, (() => void) | null>()
    const mediaSession = {
      metadata: null as unknown,
      setActionHandler: (action: string, fn: (() => void) | null) => handlers.set(action, fn),
    }
    Object.defineProperty(navigator, 'mediaSession', { value: mediaSession, configurable: true })
    vi.stubGlobal('MediaMetadata', class { constructor(public init: { title: string }) {} })

    renderWithQuery(
      <SharedBundles
        token="t"
        items={[
          item('Un', [asset('a1'), asset('b1', { groups: [basse] })]),
          item('Deux', [asset('a2'), asset('b2', { groups: [basse] })]),
        ]}
      />,
    )
    const [everyone, bass] = Array.from(document.querySelectorAll('audio'))
    fireEvent.play(everyone!)
    expect((mediaSession.metadata as { init: { title: string } }).init.title).toBe('Un')

    act(() => handlers.get('nexttrack')!())
    expect(everyone!.getAttribute('src')).toBe('https://s3.test/a2')
    expect(bass!.getAttribute('src')).toBe('https://s3.test/b1')

    // @ts-expect-error cleanup of the test-only property
    delete navigator.mediaSession
    vi.unstubAllGlobals()
  })
})

