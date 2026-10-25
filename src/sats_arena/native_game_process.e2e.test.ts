/** Opt-in launcher -> real native Dolphin stdin integration. Never uses real funds. */
import type { SettingsManager } from "@settings/settings_manager";
import type { SettingsSchema } from "@settings/types";
import { app } from "electron";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { expect, it, vi } from "vitest";

import { SatsArenaNativeGame } from "./native_game_process";
import type { NwcSecretStore } from "./nwc_secret_store";

vi.mock("electron", () => ({ app: { getPath: vi.fn(), getAppPath: vi.fn(), isPackaged: false } }));

const enabled = process.platform === "linux" && Boolean(process.env.ARENA_NATIVE_E2E_ISO);

async function ownedProcesses(profile: string): Promise<number[]> {
  const matches: number[] = [];
  for (const name of await readdir("/proc")) {
    if (!/^\d+$/.test(name)) {
      continue;
    }
    try {
      const args = (await readFile(`/proc/${name}/cmdline`, "utf8")).split("\0").filter(Boolean);
      if (
        args.includes(profile) &&
        args.some((arg) => path.basename(arg) === "dolphin-emu" || arg.endsWith("/launch-native.sh"))
      ) {
        matches.push(Number(name));
      }
    } catch {
      /* Other users' processes need not be readable. */
    }
  }
  return matches;
}

it.skipIf(!enabled)(
  "hands fake wallet configuration from launcher stdin to the actual native game",
  async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "arena-real-native-"));
    const profile = path.join(folder, "sats-arena", "dolphin-user");
    const settings = {
      isoPath: process.env.ARENA_NATIVE_E2E_ISO!,
      satsArenaDolphinBinaryPath: process.env.ARENA_NATIVE_E2E_BINARY ?? null,
      satsArenaWalletBackend: "fake",
      satsArenaSatsPerPercent: 1,
    } as SettingsSchema;
    const getSecret = vi.fn(async () => {
      throw new Error("The fake native test must never unlock a live wallet");
    });
    vi.mocked(app.getPath).mockReturnValue(folder);
    vi.mocked(app.getAppPath).mockReturnValue(path.resolve(__dirname, "../.."));
    vi.stubEnv("SATS_ARENA_WALLET_BACKEND", "fake");
    vi.stubEnv("SATS_ARENA_NWC_URI", "");
    vi.stubEnv("SATS_ARENA_FAKE_DATA_DIR", undefined);
    vi.stubEnv("SATS_ARENA_DATA_DIR", undefined);
    try {
      const game = new SatsArenaNativeGame(
        { get: () => ({ settings }) } as SettingsManager,
        { get: getSecret } as unknown as NwcSecretStore,
      );
      await game.start();
      const statePath = path.join(profile, "SatsArenaFake", "prepaid-match.json");
      let state: { simulated: boolean; pot: { paid: boolean[]; phase: string } } | undefined;
      for (let attempt = 0; attempt < 450; ++attempt) {
        try {
          state = JSON.parse(await readFile(statePath, "utf8"));
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      expect(state, "The real native host did not create its isolated fake-wallet state").toBeDefined();
      expect(state!.simulated).toBe(true);
      expect(state!.pot.paid).toEqual([false, false, false, false]);
      expect(state!.pot.phase).toBe("Funding");
      expect(getSecret).not.toHaveBeenCalled();
      expect((await ownedProcesses(profile)).length).toBeGreaterThan(0);
    } finally {
      // Match the exact isolated profile so this cannot stop a user's existing game.
      for (const pid of await ownedProcesses(profile)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* The child may already have exited. */
        }
      }
      for (let attempt = 0; attempt < 100 && (await ownedProcesses(profile)).length; ++attempt) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      for (const pid of await ownedProcesses(profile)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* Already gone. */
        }
      }
      vi.unstubAllEnvs();
      await rm(folder, { recursive: true, force: true });
    }
  },
  60_000,
);
