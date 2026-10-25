import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSettingsPage } from "./create";
import type { SettingSection } from "./types";

vi.mock("./advanced_app_settings/advanced_app_settings", () => ({ AdvancedAppSettings: () => null }));
vi.mock("./appearance_settings/appearance_settings", () => ({ AppearanceSettings: () => null }));
vi.mock("./dolphin_settings/netplay_dolphin_settings", () => ({ NetplayDolphinSettings: () => null }));
vi.mock("./game_settings/game_settings", () => ({ GameSettings: () => null }));
vi.mock("./sats_arena_settings/sats_arena_settings", () => ({ SatsArenaSettings: () => null }));
vi.mock("./settings_page", () => ({
  SettingsPage: ({ settings }: { settings: SettingSection[] }) => (
    <nav>
      {settings
        .flatMap((section) => section.items)
        .map((item) => (
          <span key={item.path}>{item.name()}|</span>
        ))}
    </nav>
  ),
}));

afterEach(cleanup);

describe("Arena settings navigation", () => {
  it("only exposes Arena, game, emulator, and app options", () => {
    const { Page } = createSettingsPage();
    render(<Page />);
    expect(screen.getByRole("navigation").textContent).toBe("Game|Developer options|Dolphin|Appearance|Advanced|");
    expect(screen.queryByText("Rules & Policies")).toBeNull();
    expect(screen.queryByText("Replays")).toBeNull();
  });
});
