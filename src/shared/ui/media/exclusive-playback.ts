// One voice at a time: every player on the page registers here, and starting
// one pauses all the others (playlists, waveform players in dialogs).
type Player = { pause: () => void }

const players = new Set<Player>()

export function registerPlayer(player: Player) {
  players.add(player)
  return () => {
    players.delete(player)
  }
}

export function pauseOtherPlayers(self: Player) {
  players.forEach((player) => {
    if (player !== self) player.pause()
  })
}
