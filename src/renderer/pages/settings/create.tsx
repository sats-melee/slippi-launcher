import { AdvancedAppSettings } from "./advanced_app_settings/advanced_app_settings";
import { AppearanceSettings } from "./appearance_settings/appearance_settings";
import { SettingsCreateMessages as Messages } from "./create.messages";
import { NetplayDolphinSettings } from "./dolphin_settings/netplay_dolphin_settings";
import { GameSettings } from "./game_settings/game_settings";
import { SatsArenaSettings } from "./sats_arena_settings/sats_arena_settings";
import { SettingsPage } from "./settings_page";
import type { SettingSection } from "./types";

export function createSettingsPage(): { Page: React.ComponentType } {
  const settings: SettingSection[] = [
    {
      title: () => Messages.generalSettings(),
      items: [
        {
          name: () => Messages.game(),
          path: "melee-options",
          component: <GameSettings />,
        },
        {
          name: () => Messages.developerOptions(),
          path: "sats-arena",
          component: <SatsArenaSettings />,
        },
      ],
    },
    {
      title: () => Messages.dolphinSettings(),
      items: [
        {
          name: () => Messages.dolphin(),
          path: "netplay-dolphin-settings",
          component: <NetplayDolphinSettings />,
        },
      ],
    },
    {
      title: () => Messages.appSettings(),
      items: [
        {
          name: () => Messages.appearance(),
          path: "appearance-settings",
          component: <AppearanceSettings />,
        },
        {
          name: () => Messages.advanced(),
          path: "advanced-settings",
          component: <AdvancedAppSettings />,
        },
      ],
    },
  ];

  const Page = () => <SettingsPage settings={settings} />;

  return { Page };
}
