import { useSyncExternalStore } from 'react'
import { pauseOtherPlayers, registerPlayer } from './exclusive-playback'
import { createListenTracker, isAtEnd, type MediaContext } from './media-analytics'
import { claimMediaSession, preferPlaybackAudioSession, updateMediaPosition } from './media-session'

/** A file the app-wide player can play. */
export type Track = {
  assetId: string
  /** Stable address (redirects to a fresh presigned URL): never expires under the player. */
  src: string
  mimeType: string
  durationMs: number | null
  media: MediaContext
}

export type PlaybackError =
  /** The browser can't play this format (AIFF…): only a download helps. */
  | 'unsupported'
  /** Network lost, file unreachable…: resuming may work. */
  | 'interrupted'

export type PlaybackState = {
  track: Track | null
  playing: boolean
  /** Waiting for data while meant to play. */
  buffering: boolean
  currentTime: number
  duration: number
  error: PlaybackError | null
}

const IDLE: PlaybackState = { track: null, playing: false, buffering: false, currentTime: 0, duration: 0, error: null }
const SEEK_STEP_SECONDS = 10

/**
 * One audio element for the whole app, outside React: playback survives
 * closing the dialog it started from or moving to another page, and the phone
 * sees a single, steady media session (lock screen, headset, background).
 */
function createPlayback() {
  let state = IDLE
  const listeners = new Set<() => void>()
  const set = (patch: Partial<PlaybackState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  let audio: HTMLAudioElement | null = null
  // Position to restore once a reloaded source is ready (resume after an error).
  let resumeAt: number | null = null
  let autoRetried = false
  // The listener means it to play: not paused by them, not finished.
  let wantPlay = false
  const listening = createListenTracker()
  const pause = () => {
    wantPlay = false
    audio?.pause()
  }
  const player = { pause }

  const titleOf = (t: Track) => t.media.songTitle
  const claim = (track: Track) =>
    claimMediaSession(
      { title: titleOf(track), artist: track.media.assetLabel ?? '', album: 'Chorale' },
      {
        play: () => void resume(),
        pause,
        stop: pause,
        seekbackward: (d) => seekBy(-(d.seekOffset ?? SEEK_STEP_SECONDS)),
        seekforward: (d) => seekBy(d.seekOffset ?? SEEK_STEP_SECONDS),
        seekto: (d) => (d.seekTime != null ? seek(d.seekTime) : undefined),
      },
    )

  function element() {
    if (audio) return audio
    const el = document.createElement('audio')
    el.preload = 'metadata'
    // In the document, like any visible player: some mobile browsers treat
    // detached media less kindly in the background.
    el.hidden = true
    document.body.appendChild(el)

    el.addEventListener('play', () => {
      const track = state.track
      if (!track) return
      pauseOtherPlayers(player)
      preferPlaybackAudioSession()
      claim(track)
      listening.play(track.media, el.currentTime)
      set({ playing: true, error: null })
    })
    el.addEventListener('playing', () => {
      autoRetried = false
      set({ buffering: false })
    })
    el.addEventListener('waiting', () => set({ buffering: !el.paused }))
    // The media fires `pause` right before `ended`: tell an end from a pause there.
    el.addEventListener('pause', () => {
      listening.stop(isAtEnd(el.currentTime, el.duration))
      updateMediaPosition(el)
      set({ playing: false, buffering: false })
    })
    el.addEventListener('ended', () => {
      wantPlay = false
    })
    el.addEventListener('timeupdate', () => {
      listening.progress(el.currentTime)
      updateMediaPosition(el)
      set({ currentTime: el.currentTime })
    })
    const onDuration = () => {
      if (Number.isFinite(el.duration)) set({ duration: el.duration })
    }
    el.addEventListener('loadedmetadata', () => {
      onDuration()
      if (resumeAt !== null) {
        el.currentTime = resumeAt
        resumeAt = null
      }
    })
    el.addEventListener('durationchange', onDuration)
    el.addEventListener('error', () => {
      const track = state.track
      if (!track) return
      const unsupported =
        el.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && el.canPlayType(track.mimeType) === ''
      // A dropped connection mid-track (train, lift, phone asleep): the stable
      // address gets a fresh presigned URL, so one silent retry often recovers.
      if (!unsupported && wantPlay && !autoRetried) {
        autoRetried = true
        reload(track, state.currentTime)
        return
      }
      listening.stop()
      set({ playing: false, buffering: false, error: unsupported ? 'unsupported' : 'interrupted' })
    })
    window.addEventListener('pagehide', () => listening.stop())
    registerPlayer(player)
    audio = el
    return el
  }

  function reload(track: Track, at: number) {
    const el = element()
    resumeAt = at > 0 ? at : null
    el.src = track.src
    // Called from the user's tap (or a media event): phones allow play() only there.
    el.play().catch(() => set({ playing: false, buffering: false }))
  }

  /**
   * Plays the track from `at` seconds, or else from where it was: the start
   * for a new one, where it stopped after an error.
   */
  function play(track: Track, at?: number) {
    const el = element()
    wantPlay = true
    const same = state.track?.assetId === track.assetId
    if (same && !state.error) {
      if (at !== undefined) seek(at)
      el.play().catch(() => {})
      return
    }
    const from = at ?? (same ? state.currentTime : 0)
    autoRetried = false
    set({
      track,
      playing: false,
      buffering: true,
      currentTime: from,
      duration: same ? state.duration : (track.durationMs ?? 0) / 1000,
      error: null,
    })
    reload(track, from)
  }

  function resume() {
    if (state.track) play(state.track)
  }

  function toggle(track: Track) {
    if (state.track?.assetId === track.assetId && state.playing) pause()
    else play(track)
  }

  function seek(seconds: number) {
    if (!audio || !state.track) return
    const max = state.duration || audio.duration || 0
    const to = Math.max(0, max > 0 ? Math.min(seconds, max) : seconds)
    audio.currentTime = to
    set({ currentTime: to })
    updateMediaPosition(audio)
  }

  function seekBy(delta: number) {
    seek((audio?.currentTime ?? 0) + delta)
  }

  /** Stops and forgets the track (closes the mini player). */
  function close() {
    wantPlay = false
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    listening.stop()
    resumeAt = null
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.metadata = null
    set(IDLE)
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    play,
    toggle,
    resume,
    pause,
    seek,
    seekBy,
    close,
  }
}

export const playback = createPlayback()

/** The app-wide player's state; idle during SSR. */
export function usePlayback() {
  return useSyncExternalStore(playback.subscribe, playback.getState, () => IDLE)
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
