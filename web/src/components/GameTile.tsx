import type { GameCatalogueEntry } from "../app/games/catalogue";
import { statusLabel } from "../app/games/catalogue";

type Props = {
  game: GameCatalogueEntry;
  onPlay?: () => void;
  disabled?: boolean;
};

export function GameTile({ game, onPlay, disabled = false }: Props) {
  const status = statusLabel(game.status);
  const isDisabled = disabled || game.status === "coming_soon" || !onPlay;

  return (
    <article
      role="listitem"
      className={`game-tile${isDisabled ? " game-tile--disabled" : ""}`}
      style={{
        background: game.background,
        ["--tile-accent" as string]: game.accent,
      }}
    >
      <div className="game-tile__body">
        <div className="game-tile__meta">
          <div className="game-tile__tags">
            <span className="game-tile__tag">{game.tag}</span>
            {status ? <span className="game-tile__badge">{status}</span> : null}
          </div>
          <h2 className="game-tile__title">{game.title}</h2>
          <p className="game-tile__blurb">{game.blurb}</p>
        </div>
        <button
          type="button"
          className="game-tile__cta"
          onClick={onPlay}
          disabled={isDisabled}
          aria-label={`${game.cta}: ${game.title}`}
        >
          {game.cta}
        </button>
      </div>
    </article>
  );
}
