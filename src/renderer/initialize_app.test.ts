import { DolphinLaunchType } from "@dolphin/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Services } from "@/services/types";

import { initializeApp } from "./initialize_app";

afterEach(() => vi.unstubAllGlobals());

describe("Arena startup", () => {
  it("doesn't initialize Slippi accounts, fetch policy data, or install playback Dolphin", async () => {
    const init = vi.fn();
    const fetchUserData = vi.fn();
    const downloadDolphin = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("electron", { common: { checkForAppUpdates: vi.fn().mockResolvedValue(undefined) }, bootstrap: {} });
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
    const services = {
      authService: { init },
      slippiBackendService: { fetchUserData },
      dolphinService: { downloadDolphin },
      notificationService: { showError: vi.fn() },
    } as unknown as Services;

    await initializeApp(services);
    expect(init).not.toHaveBeenCalled();
    expect(fetchUserData).not.toHaveBeenCalled();
    expect(downloadDolphin).toHaveBeenCalledExactlyOnceWith(DolphinLaunchType.NETPLAY);
  });
});
