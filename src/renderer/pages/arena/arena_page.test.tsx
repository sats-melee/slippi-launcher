import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ArenaPage } from "./arena_page";

const mocks = vi.hoisted(() => ({ iso: "melee.iso" as string | null, backend: "nwc", open: vi.fn() }));
vi.mock("@/lib/hooks/use_settings", () => ({
  useSetting: (key: string) => [key === "isoPath" ? mocks.iso : mocks.backend],
}));
vi.mock("@/lib/hooks/use_settings_modal", () => ({ useSettingsModal: () => ({ open: mocks.open }) }));
vi.mock("@/pages/settings/sats_arena_settings/sats_arena_settings", () => ({
  NwcSettings: () => <div>NWC connection</div>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.iso = "melee.iso";
  mocks.backend = "nwc";
});

it("shows a focused wallet view without server or sandbox settings", () => {
  render(<ArenaPage />);
  expect(screen.getByRole("region", { name: "Lightning wallet" })).toBeTruthy();
  expect(screen.getByText("NWC connection")).toBeTruthy();
  expect(screen.queryByText("Server mode")).toBeNull();
  expect(screen.queryByText("Sandbox — Alby test wallets")).toBeNull();
  expect(screen.queryByRole("button", { name: "Play local Arena" })).toBeNull();
});

it("keeps missing-ISO setup reachable", () => {
  mocks.iso = null;
  render(<ArenaPage />);
  fireEvent.click(screen.getByRole("button", { name: "Choose your Melee ISO to play" }));
  expect(mocks.open).toHaveBeenCalledWith("/settings/melee-options");
});

it("identifies an active test wallet and links to developer options without unlocking live NWC", () => {
  mocks.backend = "sandbox";
  render(<ArenaPage />);
  expect(screen.queryByText("NWC connection")).toBeNull();
  expect(screen.getByText(/developer test wallet is active/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Developer options" }));
  expect(mocks.open).toHaveBeenCalledWith("/settings/sats-arena");
});
