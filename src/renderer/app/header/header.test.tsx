import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "./header";

const mocks = vi.hoisted(() => ({
  isoPath: "/games/melee.iso" as string | null,
  launch: vi.fn(),
  launchLocal: vi.fn(async () => undefined),
  ready: true,
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
  useDolphinStore: (select: (state: { netplayStatus: string }) => unknown) =>
    select({ netplayStatus: mocks.ready ? "ready" : "updating" }),
}));
vi.mock("@/services", () => ({
  useServices: () => ({ dolphinService: {}, satsArenaService: { launchLocalGame: mocks.launchLocal } }),
}));
vi.mock("@/styles/platform_title_bar_styles", () => ({ platformTitleBarStyles: () => "" }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isoPath = "/games/melee.iso";
  mocks.ready = true;
});
afterEach(cleanup);

describe("Arena header", () => {
  const showHeader = () =>
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

  it("shows Online, Local and settings without a launcher account gate", () => {
    showHeader();
    expect(screen.getByAltText("Sats Melee")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Online" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Local" })).toBeTruthy();
    expect(screen.queryByText("Log in")).toBeNull();
  });

  it("keeps Online disabled and never launches netplay", () => {
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    expect((screen.getByRole("button", { name: "Online" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.launchLocal).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("opens game setup when Local is pressed without an ISO", () => {
    mocks.isoPath = null;
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "Local" }));
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.launchLocal).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith("/settings/melee-options");
  });

  it("launches local Arena independently of the online Dolphin installation", async () => {
    mocks.ready = false;
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "Local" }));
    await waitFor(() => expect(mocks.launchLocal).toHaveBeenCalledOnce());
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("explains the beta and lost-funds disclaimer in About", async () => {
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    expect(await screen.findByRole("dialog", { name: "About Sats Melee" })).toBeTruthy();
    expect(screen.getByText(/developer is not responsible for lost funds/)).toBeTruthy();
  });

  it("disables Local while launching and shows startup errors", async () => {
    let fail!: (error: Error) => void;
    mocks.launchLocal.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    showHeader();
    fireEvent.click(screen.getByRole("button", { name: "Local" }));
    expect((screen.getByRole("button", { name: "Launching…" }) as HTMLButtonElement).disabled).toBe(true);
    const error = new Error("Save an NWC connection before playing");
    fail(error);
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(error));
    expect((screen.getByRole("button", { name: "Local" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
