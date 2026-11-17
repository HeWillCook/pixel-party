export interface PlayersPanelProps {
  players: number
  roster: { userId: string; name: string }[]
  watching: number
}

export function PlayersPanel({ players, roster, watching }: PlayersPanelProps) {
  return (
    <div data-testid="players-panel" className="pp-panel px-3 py-2.5 text-[19px] leading-[1.15]">
      <h4 className="mb-1.5 text-[22px] uppercase text-[var(--sunset-2)]">Players</h4>
      <p data-testid="round-players" className="my-1 text-[var(--sunset-1)]">
        {players} {players === 1 ? 'painter' : 'painters'}
      </p>
      {roster.map((player) => (
        <p key={player.userId} className="my-1 truncate text-foreground">
          &gt; {player.name.toUpperCase()}
        </p>
      ))}
      <p data-testid="round-watching" className="my-1 text-foreground opacity-60">
        {watching} watching
      </p>
    </div>
  )
}
