import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SatsArenaSettings } from "./sats_arena_settings";

const mocks = vi.hoisted(() => ({
  mode: "sandbox",
  change: vi.fn(),
  info: vi.fn(async () => ({ ready: true, addresses: ["nwc1@getalby.com", "nwc2@getalby.com"] })),
  setup: vi.fn(async () => ({ ready: true, addresses: ["nwc1@getalby.com", "nwc2@getalby.com"] })),
  live: vi.fn(async () => ({ saved: true, encrypted: true })),
  error: vi.fn(),
}));
vi.mock("@/lib/hooks/use_settings", () => ({
  useSatsArenaMode: () => ["off", vi.fn()],
  useSetting: (key: string) => [key === "satsArenaWalletBackend" ? mocks.mode : null, mocks.change],
}));
vi.mock("@/lib/hooks/use_toasts", () => ({ useToasts: () => ({ showError: mocks.error, showSuccess: vi.fn() }) }));
vi.mock("@/components/path_input/path_input", () => ({ PathInput: () => null }));
vi.mock("@/services", () => {
  const satsArenaService = { getSandboxInfo: mocks.info, setupSandbox: mocks.setup, getNwcInfo: mocks.live };
  return { useServices: () => ({ satsArenaService }) };
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "sandbox";
});
afterEach(cleanup);

it("shows prefilled sandbox addresses without reading the live connection", async () => {
  render(<SatsArenaSettings />);
  await screen.findByText("Player 1: nwc1@getalby.com");
  expect(screen.getByRole("radio", { name: "Sandbox — Alby test wallets" })).toBeTruthy();
  expect(screen.queryByText("Fake wallet (no real sats, for testing)")).toBeNull();
  expect(mocks.live).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("radio", { name: "Live Lightning — saved NWC connection" }));
  expect(mocks.change).toHaveBeenCalledWith("nwc");
});

it("prepares reusable wallets and displays their addresses", async () => {
  mocks.info.mockResolvedValueOnce({ ready: false, addresses: [] });
  render(<SatsArenaSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "Prepare test wallets" }));
  await waitFor(() => expect(mocks.setup).toHaveBeenCalledOnce());
  await screen.findByText("Player 2: nwc2@getalby.com");
  expect(mocks.error).not.toHaveBeenCalled();
});

it("keeps live wallet settings separate from sandbox provisioning", async () => {
  mocks.mode = "nwc";
  render(<SatsArenaSettings />);
  await screen.findByText("A connection string is saved.");
  expect(mocks.info).not.toHaveBeenCalled();
  expect(mocks.setup).not.toHaveBeenCalled();
});
