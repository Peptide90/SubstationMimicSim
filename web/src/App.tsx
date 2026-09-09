import { useState } from "react";

import { MainMenu } from "./components/MainMenu";
import { MultiplayerApp } from "./mp/MultiplayerApp";
import { MimicDesignerV2 } from "./mimic-designer-v2/ui/MimicDesignerV2";
import { BUILD_TAG } from "./app/constants/branding";

type View = "menu" | "editor" | "challenges" | "mp";

export default function App() {
  const [view, setView] = useState<View>("menu");
  const toMenu = () => setView("menu");

  switch (view) {
    case "editor":
      return <MimicDesignerV2 onRequestMenu={toMenu} />;
    case "challenges":
      return <MimicDesignerV2 onRequestMenu={toMenu} initialPlatformView="scenarios" />;
    case "mp":
      return <MultiplayerApp onExit={toMenu} />;
    default:
      return (
        <MainMenu
          buildTag={BUILD_TAG}
          onStartSolo={() => setView("editor")}
          onStartChallenges={() => setView("challenges")}
          onStartMultiplayer={() => setView("mp")}
        />
      );
  }
}
