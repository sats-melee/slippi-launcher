import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ArenaPage } from "./arena_page";

const mocks = vi.hoisted(() => ({ iso: "melee.iso" as string | null, backend: "nwc", open: vi.fn() }));
vi.mock("@/lib/hooks/use_settings", () => ({
  useSetting: (key: string) => [
    { isoPath: mocks.iso, satsArenaWalletBackend: mocks.backend, satsArenaEntrySats: 400, satsArenaSatsPerPercent: 1 }[
      key
    ],
  ],
}));
vi.mock("@/lib/hooks/use_toasts", () => ({ useToasts: () => ({ showError: vi.fn(), showSuccess: vi.fn() }) }));
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
  expect(screen.getByRole("region", { name: "Connect via NWC" })).toBeTruthy();
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

it("defaults to 400 sats and 1 sat per percent, and saves both rules together", async () => {
  const updateSettings = vi.fn(async () => undefined);
  Object.assign(window, { electron: { settings: { updateSettings } } });
  render(<ArenaPage />);
  const entry = screen.getByLabelText("Entry invoice (sats)") as HTMLInputElement;
  const rate = screen.getByLabelText("Sats per 1% damage") as HTMLInputElement;
  expect(entry.value).toBe("400");
  expect(rate.value).toBe("1");
  const save = screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(entry, { target: { value: "0" } });
  expect(save.disabled).toBe(true);
  fireEvent.change(entry, { target: { value: "275" } });
  fireEvent.change(rate, { target: { value: "3" } });
  fireEvent.click(save);
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith([
      { key: "satsArenaEntrySats", value: 275 },
      { key: "satsArenaSatsPerPercent", value: 3 },
    ]),
  );
});

it("identifies an active test wallet and links to developer options without unlocking live NWC", () => {
  mocks.backend = "sandbox";
  render(<ArenaPage />);
  expect(screen.queryByText("NWC connection")).toBeNull();
  expect(screen.getByText(/developer test wallet is active/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Developer options" }));
  expect(mocks.open).toHaveBeenCalledWith("/settings/sats-arena");
});
