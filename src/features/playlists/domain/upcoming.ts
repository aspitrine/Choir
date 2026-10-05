export interface UpcomingPlaylist<P> {
  playlist: P
  nextEventDate: Date | null
  eventDateCount: number
}

/**
 * Playlists to show on the dashboard: those without dates (always shown) and
 * those with at least one date still ahead — soonest first, undated last.
 */
export function selectUpcoming<P extends { id: string }>(
  playlists: ReadonlyArray<P>,
  dates: ReadonlyArray<{ playlistId: string; eventDate: Date }>,
  now: Date,
): Array<UpcomingPlaylist<P>> {
  const result: Array<UpcomingPlaylist<P>> = []
  for (const playlist of playlists) {
    const own = dates.filter((d) => d.playlistId === playlist.id)
    const future = own
      .map((d) => d.eventDate)
      .filter((d) => d >= now)
      .sort((a, b) => a.getTime() - b.getTime())
    if (own.length === 0) result.push({ playlist, nextEventDate: null, eventDateCount: 0 })
    else if (future.length > 0) result.push({ playlist, nextEventDate: future[0]!, eventDateCount: own.length })
  }
  return result.sort((a, b) => {
    if (a.nextEventDate && b.nextEventDate) return a.nextEventDate.getTime() - b.nextEventDate.getTime()
    if (a.nextEventDate) return -1
    if (b.nextEventDate) return 1
    return 0
  })
}
