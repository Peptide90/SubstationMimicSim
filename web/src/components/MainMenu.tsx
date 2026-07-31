import { useMemo, useState } from "react";

import {
  GAME_CATALOGUE,
  HUB_PRODUCT_NAME,
  HUB_TAGLINE,
  isLaunchableGameId,
  type LaunchableGameId,
} from "../app/games/catalogue";
import { BrandingCluster } from "./BrandingCluster";
import { ChangelogModal } from "./ChangelogModal";
import { GameTile } from "./GameTile";
import "./MainMenu.css";

type Props = {
  buildTag: string;
  onStartSolo: () => void;
  onStartChallenges: () => void;
  onStartMultiplayer: () => void;
};

export function MainMenu({ buildTag, onStartSolo, onStartChallenges, onStartMultiplayer }: Props) {
  const [changelogOpen, setChangelogOpen] = useState(false);

  const launchers = useMemo(
    (): Record<LaunchableGameId, () => void> => ({
      mimic: onStartSolo,
      challenges: onStartChallenges,
      multiplayer: onStartMultiplayer,
    }),
    [onStartSolo, onStartChallenges, onStartMultiplayer]
  );

  return (
    <div className="hub-menu">
      <header className="hub-menu__hero">
        <h1 className="hub-menu__title">{HUB_PRODUCT_NAME}</h1>
        <p className="hub-menu__tagline">{HUB_TAGLINE}</p>
      </header>

      <div className="hub-menu__gallery" role="list">
        {GAME_CATALOGUE.map((game) => (
          <GameTile
            key={game.id}
            game={game}
            onPlay={isLaunchableGameId(game.id) ? launchers[game.id] : undefined}
          />
        ))}
      </div>

      <div className="hub-menu__footer">
        <BrandingCluster
          buildTag={buildTag}
          variant="footer"
          align="center"
          onVersionClick={() => setChangelogOpen(true)}
        />
      </div>

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  );
}
