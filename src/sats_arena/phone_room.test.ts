import { describe, expect, it, vi } from "vitest";

import { nativeWalletLaunch } from "./native_game_process";
import { phoneRoomUrlError } from "./phone_room";

vi.mock("electron", () => ({ app: {} }));

describe("phone room settings", () => {
  it("uses the displayed default for legacy empty phone-room settings", async () => {
    const secrets = { get: vi.fn() };
    const launch = await nativeWalletLaunch(
      {
        satsArenaWalletBackend: "fake",
        satsArenaEntrySats: 400,
        satsArenaSatsPerPercent: 1,
        satsArenaPhoneRoomEnabled: true,
        satsArenaPhoneRoomServerUrl: "",
      },
      secrets,
      {},
    );
    expect(launch.env.SATS_ARENA_ROOM_SERVER_URL).toBe("https://melee.landaverde.io");
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it("accepts secure server origins and local development, rejecting credentials and remote HTTP", () => {
    for (const url of ["https://arena.example.com", "http://127.0.0.1:8738/", "http://localhost:8738"]) {
      expect(phoneRoomUrlError(url)).toBeNull();
    }
    for (const url of [
      "",
      "http://arena.example.com",
      "https://user:secret@arena.example.com",
      "https://arena.example.com/path",
      "https://arena.example.com?token=secret",
      "wss://arena.example.com",
    ]) {
      expect(phoneRoomUrlError(url)).not.toBeNull();
    }
  });

  it("passes only the room server URL to LOCAL and honors the disabled toggle", async () => {
    const settings = {
      satsArenaWalletBackend: "fake" as const,
      satsArenaEntrySats: 400,
      satsArenaSatsPerPercent: 1,
      satsArenaPhoneRoomEnabled: true,
      satsArenaPhoneRoomServerUrl: "https://arena.example.com/",
    };
    const secrets = { get: vi.fn() };
    const launch = await nativeWalletLaunch(settings, secrets, {});
    expect(launch.env.SATS_ARENA_ROOM_SERVER_URL).toBe("https://arena.example.com");
    expect(secrets.get).not.toHaveBeenCalled();
    const disabled = await nativeWalletLaunch({ ...settings, satsArenaPhoneRoomEnabled: false }, secrets, {
      SATS_ARENA_ROOM_SERVER_URL: "https://inherited.example.com",
    });
    expect(disabled.env.SATS_ARENA_ROOM_SERVER_URL).toBeUndefined();
    await expect(
      nativeWalletLaunch(
        {
          ...settings,
          satsArenaPhoneRoomServerUrl: "http://remote.example.com",
        },
        secrets,
        {},
      ),
    ).rejects.toThrow("HTTPS");
  });
});
