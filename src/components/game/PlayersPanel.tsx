export interface PlayersPanelProps {
  players: number
  roster: { userId: string; name: string }[]
  watching: number
  hostId?: string
  youId?: string | null
}

/** Host first, then everyone else in the order the room reports them (join order). */
export function orderRoster<T extends { userId: string }>(roster: T[], hostId?: string): T[] {
  return hostId ? [...roster.filter(p => p.userId === hostId), ...roster.filter(p => p.userId !== hostId)] : roster
}

export function PlayersPanel({ players, roster, watching, hostId, youId }: PlayersPanelProps) {
  return (
    <div data-testid="players-panel" className="pp-panel px-3 py-2.5 text-[19px] leading-[1.15]">
      <h4 className="mb-1.5 text-[22px] uppercase text-[var(--sunset-2)]">Players</h4>
      <p data-testid="round-players" className="my-1 text-[var(--sunset-1)]">
        {players} {players === 1 ? 'painter' : 'painters'}
      </p>
      {orderRoster(roster, hostId).map((player) => (
        <p key={player.userId} data-testid="roster-row" className="my-1 flex items-baseline gap-1.5 text-foreground">
          <span aria-hidden="true" className="text-[var(--sunset-3)]">•</span>
          <span className="truncate uppercase">{player.name}</span>
          {(player.userId === hostId || player.userId === youId) && (
            <span className="roster-tags">
              {player.userId === hostId && <span className="roster-tag">host</span>}
              {player.userId === youId && <span className="roster-tag roster-tag--you">you</span>}
            </span>
          )}
        </p>
      ))}
      <p data-testid="round-watching" className="my-1 text-foreground opacity-60">
        {watching} watching
      </p>
    </div>
  )
}
