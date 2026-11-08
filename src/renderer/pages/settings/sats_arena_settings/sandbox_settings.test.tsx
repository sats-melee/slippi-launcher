import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SatsArenaNwcCheck } from "sats_arena/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SatsArenaSettings } from "./sats_arena_settings";

const mocks = vi.hoisted(() => ({
  mode: "sandbox",
  cpuWallets: false,
  updateSettings: vi.fn(),
  success: vi.fn(),
  change: vi.fn(),
  info: vi.fn(async () => ({ ready: true, addresses: ["nwc1@getalby.com", "nwc2@getalby.com"] })),
  setup: vi.fn(async () => ({ ready: true, addresses: ["nwc1@getalby.com", "nwc2@getalby.com"] })),
  live: vi.fn(async () => ({ saved: true, encrypted: true })),
  check: vi.fn(async () => ({ ok: true, message: "Wallet connected" } as SatsArenaNwcCheck)),
  error: vi.fn(),
}));
vi.mock("@/lib/hooks/use_settings", () => ({
  useSatsArenaMode: () => ["off", vi.fn()],
  useSetting: (key: string) => [
    key === "satsArenaWalletBackend" ? mocks.mode : key === "satsArenaCpuWallets" ? mocks.cpuWallets : null,
    mocks.change,
  ],
}));
vi.mock("@/lib/hooks/use_toasts", () => ({
  useToasts: () => ({ showError: mocks.error, showSuccess: mocks.success }),
}));
vi.mock("@/components/path_input/path_input", () => ({ PathInput: () => null }));
vi.mock("@/services", () => {
  const satsArenaService = {
    getSandboxInfo: mocks.info,
    setupSandbox: mocks.setup,
    getNwcInfo: mocks.live,
    checkNwc: mocks.check,
  };
  return { useServices: () => ({ satsArenaService }) };
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "sandbox";
  mocks.cpuWallets = false;
  const info = { ready: true, addresses: [1, 2, 3, 4].map((port) => `nwc${port}@getalby.com`) };
  mocks.info.mockResolvedValue(info);
  mocks.setup.mockResolvedValue(info);
  mocks.change.mockResolvedValue(undefined);
  mocks.updateSettings.mockResolvedValue(undefined);
  Object.assign(window, {
    electron: { settings: { updateSettings: mocks.updateSettings } },
  });
});
afterEach(cleanup);

it("shows prefilled sandbox addresses without reading the live connection", async () => {
  render(<SatsArenaSettings />);
  await screen.findByText("Player 1: nwc1@getalby.com");
  expect(screen.getByRole("radio", { name: "Sandbox — Alby test wallets" })).toBeTruthy();
  expect(screen.queryByText("Fake wallet (no real sats, for testing)")).toBeNull();
  expect(mocks.live).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("radio", { name: "Live Lightning — saved NWC connection" }));
  expect(mocks.change).toHaveBeenCalledWith("nwc");
});

it("shows the default room server for a legacy empty setting", async () => {
  render(<SatsArenaSettings />);
  expect(await screen.findByDisplayValue("https://melee.landaverde.io")).toBeTruthy();
  expect(mocks.live).not.toHaveBeenCalled();
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
  await screen.findByLabelText("Wallet verified");
  expect(mocks.check).toHaveBeenCalledWith(false);
});

it("shows a wallet error instead of a green check when the saved connection times out", async () => {
  mocks.mode = "nwc";
  mocks.check.mockResolvedValueOnce({ ok: false, message: "NWC wallet connection timed out" });
  render(<SatsArenaSettings />);
  expect((await screen.findByRole("alert")).textContent).toContain("timed out");
  expect(screen.queryByLabelText("Wallet verified")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await screen.findByLabelText("Wallet verified");
});

it("generates a test invoice only on request and displays its QR", async () => {
  mocks.mode = "nwc";
  render(<SatsArenaSettings />);
  await screen.findByLabelText("Wallet verified");
  mocks.check.mockResolvedValueOnce({
    ok: true,
    message: "Invoice created",
    invoice: "lnbc1fixture",
    amount_sats: 1,
    qr_svg: "<svg/>",
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate test invoice" }));
  expect(await screen.findByAltText("Lightning test invoice QR code")).toBeTruthy();
  expect((screen.getByLabelText("Lightning test invoice") as HTMLInputElement).value).toBe("lnbc1fixture");
  expect(mocks.check).toHaveBeenLastCalledWith(true);
});

it.each(["nwc", "sandbox"])("makes CPU wallets available in developer options in %s mode", async (backend) => {
  mocks.mode = backend;
  render(<SatsArenaSettings />);
  const toggle = screen.getByRole("checkbox", {
    name: "CPU wallets",
  }) as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  expect(screen.getByText(/Include CPU opponents in entry payments/)).toBeTruthy();
  fireEvent.click(toggle);
  await waitFor(() => expect(mocks.change).toHaveBeenCalledWith(true));
});

it("sets up funded CPU test wallets before enabling Sandbox and CPU participation together", async () => {
  mocks.mode = "nwc";
  render(<SatsArenaSettings />);
  expect(screen.getByText(/no real bitcoin/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Set up CPU test wallets" }));
  await waitFor(() =>
    expect(mocks.updateSettings).toHaveBeenCalledWith([
      { key: "satsArenaWalletBackend", value: "sandbox" },
      { key: "satsArenaCpuWallets", value: true },
    ]),
  );
  expect(mocks.setup).toHaveBeenCalledOnce();
  expect(mocks.setup.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateSettings.mock.invocationCallOrder[0]);
  expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining("reopen LOCAL"));
});

it.each(["unavailable", "incomplete"])("keeps the current wallet mode when CPU wallet setup is %s", async (failure) => {
  if (failure === "unavailable") {
    mocks.setup.mockRejectedValueOnce(new Error("Faucet unavailable"));
  } else {
    mocks.setup.mockResolvedValueOnce({ ready: false, addresses: [] });
  }
  render(<SatsArenaSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Set up CPU test wallets" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(mocks.updateSettings).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});

it("shows newly prepared CPU addresses when Sandbox and CPU wallets are already selected", async () => {
  mocks.cpuWallets = true;
  mocks.info.mockResolvedValueOnce({ ready: false, addresses: [] });
  render(<SatsArenaSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Set up CPU test wallets" }));
  await screen.findByText("Player 4: nwc4@getalby.com");
  expect(mocks.info).toHaveBeenCalledOnce();
  expect(mocks.setup).toHaveBeenCalledOnce();
  expect(mocks.updateSettings).toHaveBeenCalledOnce();
});

it("explains an empty live CPU address and shows existing automatic addresses in Sandbox", async () => {
  mocks.cpuWallets = true;
  mocks.mode = "nwc";
  const live = render(<SatsArenaSettings />);
  expect(screen.getByText(/CPU wallets are not created automatically/)).toBeTruthy();
  expect(mocks.info).not.toHaveBeenCalled();
  live.unmount();
  mocks.mode = "sandbox";
  render(<SatsArenaSettings />);
  await screen.findByText("Player 4: nwc4@getalby.com");
  expect(screen.getAllByText("Player 1: nwc1@getalby.com")).toHaveLength(1);
  expect(screen.getByText(/Test pay on every player card/)).toBeTruthy();
  expect(mocks.setup).not.toHaveBeenCalled();
});
