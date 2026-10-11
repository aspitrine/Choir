import { describe, it, expect, vi } from 'vitest'
import { createListenTracker, type MediaContext } from './media-analytics'

const alto: MediaContext = { source: 'shared_playlist', songTitle: 'Ave Maria', assetId: 'a1', assetLabel: 'Alto' }
const bass: MediaContext = { source: 'shared_playlist', songTitle: 'Ave Maria', assetId: 'a2', assetLabel: 'Basse' }

function setup() {
  const send = vi.fn()
  return { send, tracker: createListenTracker(send) }
}

const events = (send: ReturnType<typeof vi.fn>, name: string) =>
  send.mock.calls.filter(([n]) => n === name).map(([, props]) => props)

describe('createListenTracker', () => {
  it('sends the listened seconds when the stretch ends', () => {
    const { send, tracker } = setup()
    tracker.play(alto, 0)
    for (let t = 0.25; t <= 30; t += 0.25) tracker.progress(t)
    tracker.stop()

    expect(events(send, 'audio_play')).toEqual([expect.objectContaining({ asset_id: 'a1', asset_label: 'Alto' })])
    expect(events(send, 'audio_listen')).toEqual([expect.objectContaining({ asset_id: 'a1', seconds: 30, completed: false })])
  })

  it('does not count seeks as listening', () => {
    const { send, tracker } = setup()
    tracker.play(alto, 0)
    tracker.progress(1)
    tracker.progress(2)
    tracker.progress(120) // jumped forward
    tracker.progress(121)
    tracker.progress(30) // jumped back
    tracker.stop(true)

    expect(events(send, 'audio_listen')).toEqual([expect.objectContaining({ seconds: 3, completed: true })])
  })

  it('ignores progress while paused and resumes counting after play', () => {
    const { send, tracker } = setup()
    tracker.play(alto, 0)
    tracker.progress(1.5)
    tracker.stop()
    tracker.progress(50)
    tracker.play(alto, 50)
    tracker.progress(51.5)
    tracker.stop()

    expect(events(send, 'audio_play')).toHaveLength(2)
    expect(events(send, 'audio_listen').map((p) => p.seconds)).toEqual([2, 2])
  })

  it('closes the previous track when another one starts', () => {
    const { send, tracker } = setup()
    tracker.play(alto, 0)
    tracker.progress(2)
    tracker.play(bass, 0)
    tracker.progress(2)
    tracker.stop()

    expect(events(send, 'audio_listen').map((p) => p.asset_id)).toEqual(['a1', 'a2'])
  })

  it('skips stretches shorter than a second', () => {
    const { send, tracker } = setup()
    tracker.play(alto, 0)
    tracker.progress(0.5)
    tracker.stop()

    expect(events(send, 'audio_listen')).toEqual([])
  })
})
