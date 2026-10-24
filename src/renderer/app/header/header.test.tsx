import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "./header";

const mocks = vi.hoisted(() => ({
  isoPath: "/games/melee.iso" as string | null,
  launch: vi.fn(),
  open: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@/lib/hooks/use_settings", () => ({
  useSettings: (select: (state: { settings: { isoPath: string | null } }) => unknown) =>
    select({ settings: { isoPath: mocks.isoPath } }),
}));
vi.mock("@/lib/hooks/use_settings_modal", () => ({ useSettingsModal: () => ({ open: mocks.open }) }));
vi.mock("@/lib/hooks/use_toasts", () => ({ useToasts: () => ({ showError: mocks.showError }) }));
vi.mock("@/lib/dolphin/use_dolphin_actions", () => ({ useDolphinActions: () => ({ launchNetplay: mocks.launch }) }));
vi.mock("@/lib/dolphin/use_dolphin_store", () => ({
  DolphinStatus: { READY: "ready" },
  useDolphinStore: (select: (state: { netplayStatus: string }) => unknown) => select({ netplayStatus: "ready" }),
}));
vi.mock("@/services", () => ({ useServices: () => ({ dolphinService: {} }) }));
vi.mock("@/styles/platform_title_bar_styles", () => ({ platformTitleBarStyles: () => "" }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isoPath = "/games/melee.iso";
});
afterEach(cleanup);

describe("Arena header", () => {
  const showHeader = () =>
    render(
      <MemoryRouter>
        <Header menuItems={[]} />
      </MemoryRouter>,
    );

  it("shows Play and settings but no sign-in or account menu", () => {
    showHeader();
    expect(screen.getByText("Sats Arena")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByText("Log in")).toBeNull();
  });

  it("launches Dolphin without requiring a launcher account", () => {
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(mocks.launch).toHaveBeenCalledWith(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("opens game setup, not sign-in, when the ISO is missing", () => {
    mocks.isoPath = null;
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith("/settings/melee-options");
  });
});
