import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArenaPage } from "./arena_page";

const mocks = vi.hoisted(() => ({
  iso: "melee.iso" as string | null,
  launch: vi.fn(async () => undefined),
  showError: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/lib/hooks/use_settings", () => ({ useSetting: () => [mocks.iso] }));
vi.mock("@/lib/hooks/use_settings_modal", () => ({ useSettingsModal: () => ({ open: mocks.open }) }));
vi.mock("@/lib/hooks/use_toasts", () => ({ useToasts: () => ({ showError: mocks.showError }) }));
vi.mock("@/services", () => ({ useServices: () => ({ satsArenaService: { launchLocalGame: mocks.launch } }) }));
vi.mock("@/pages/settings/sats_arena_settings/sats_arena_settings", () => ({ SatsArenaSettings: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.iso = "melee.iso";
});

describe("local Arena play", () => {
  it("uses the dedicated local-game IPC and does not need host-server mode", async () => {
    render(<ArenaPage />);
    fireEvent.click(screen.getByRole("button", { name: "Play local Arena" }));
    await waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
    expect(mocks.launch).toHaveBeenCalledWith();
  });
  it("requires an ISO and exposes connection/startup errors without secret data", async () => {
    mocks.iso = null;
    const { unmount } = render(<ArenaPage />);
    expect((screen.getByRole("button", { name: "Play local Arena" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    mocks.iso = "melee.iso";
    const error = new Error("Save an NWC connection in Wallet settings before playing with Lightning");
    mocks.launch.mockRejectedValueOnce(error);
    render(<ArenaPage />);
    fireEvent.click(screen.getByRole("button", { name: "Play local Arena" }));
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(error));
  });
});
