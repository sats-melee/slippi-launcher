import type { SettingsManager } from "@settings/settings_manager";
import type { SettingsSchema } from "@settings/types";
import { app } from "electron";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withoutArenaWalletEnv } from "../dolphin/arena_wallet_env";
import { findNativeGameBinary, nativeWalletLaunch, SatsArenaNativeGame } from "./native_game_process";
import type { NwcSecretStore } from "./nwc_secret_store";

vi.mock("electron", () => ({ app: { getPath: vi.fn(), getAppPath: vi.fn(), isPackaged: false } }));

const uri = "nostr+walletconnect://fixture-wallet?secret=fixture-private-key";

describe("native wallet configuration", () => {
  it("uses isolated sandbox credentials on stdin and never unlocks the live wallet", async () => {
    const secrets = {
      get: vi.fn(async () => {
        throw new Error("live secret must stay locked");
      }),
    };
    const sandbox = {
      ensure: vi.fn(async () => ({
        version: 1 as const,
        wallets: Array.from({ length: 5 }, (_, i) => ({
          uri: `nostr+walletconnect://sandbox-${i}`,
          address: `nwc${i}@getalby.com`,
        })),
      })),
    };
    const settings = { satsArenaWalletBackend: "sandbox" as const, satsArenaSatsPerPercent: 1 };
    const launch = await nativeWalletLaunch(settings, secrets, {}, sandbox);
    expect(launch.payload.backend).toBe("sandbox");
    expect(launch.payload.sandbox_players).toHaveLength(4);
    expect(launch.payload.nwc_uri).toBe("nostr+walletconnect://sandbox-0");
    expect(JSON.stringify(launch.env)).not.toContain("sandbox-");
    expect(secrets.get).not.toHaveBeenCalled();
    await expect(nativeWalletLaunch(settings, secrets, { SATS_ARENA_NWC_URI: uri }, sandbox)).rejects.toThrow(
      "Clear the development NWC override",
    );
    sandbox.ensure.mockRejectedValueOnce(new Error("sandbox offline"));
    await expect(nativeWalletLaunch(settings, secrets, {}, sandbox)).rejects.toThrow("sandbox offline");
    expect(secrets.get).not.toHaveBeenCalled();
  });
  const settings = { satsArenaWalletBackend: "nwc", satsArenaSatsPerPercent: 1 } as const;
  it("reads the saved NWC in main and keeps it out of the production environment", async () => {
    const secrets = { get: vi.fn(async () => uri) };
    const launch = await nativeWalletLaunch(settings, secrets, { PATH: "/test", SATS_ARENA_FAKE_LOCAL: "0" });
    expect(launch.payload).toEqual({ version: 1, backend: "nwc", nwc_uri: uri });
    expect(launch.env.SATS_ARENA_WALLET_CONFIG).toBe("stdin");
    expect(launch.env.SATS_ARENA_NWC_URI).toBeUndefined();
    expect(launch.env.SATS_ARENA_FAKE_LOCAL).toBeUndefined();
    expect(launch.env.SATS_ARENA_SATS_PER_PERCENT).toBe("1");
  });
  it("accepts an explicit dev URI instead of unlocking saved production credentials", async () => {
    const secrets = {
      get: vi.fn(async () => {
        throw new Error("locked");
      }),
    };
    const launch = await nativeWalletLaunch({ ...settings, satsArenaWalletBackend: "fake" }, secrets, {
      SATS_ARENA_NWC_URI: uri,
    });
    expect(launch.payload).toEqual({ version: 1, backend: "nwc", nwc_uri: uri });
    expect(secrets.get).not.toHaveBeenCalled();
    await expect(
      nativeWalletLaunch(settings, secrets, { SATS_ARENA_NWC_URI: uri, SATS_ARENA_WALLET_BACKEND: "fake" }),
    ).rejects.toThrow("conflicts");
  });
  it("fails closed for missing live credentials and sends no secret in fake mode", async () => {
    const secrets = { get: vi.fn(async () => null) };
    await expect(nativeWalletLaunch(settings, secrets, {})).rejects.toThrow("Save an NWC");
    expect((await nativeWalletLaunch({ ...settings, satsArenaWalletBackend: "fake" }, secrets, {})).payload).toEqual({
      version: 1,
      backend: "fake",
    });
    await expect(nativeWalletLaunch(settings, secrets, { SATS_ARENA_WALLET_BACKEND: "other" })).rejects.toThrow(
      "fake or nwc",
    );
  });
  it("strips every Arena configuration key from replay/netplay/configure child environments", () => {
    expect(
      withoutArenaWalletEnv({
        PATH: "ok",
        SATS_ARENA_NWC_URI: uri,
        SATS_ARENA_WALLET_CONFIG: "stdin",
        SATS_ARENA_ENTRY_SATS: "500",
      }),
    ).toEqual({ PATH: "ok" });
  });
});

describe.skipIf(process.platform === "win32")("native game private stdin handoff", () => {
  let folder: string;
  let settings: SettingsSchema;
  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "arena-native-handoff-"));
    vi.mocked(app.getPath).mockReturnValue(folder);
    vi.mocked(app.getAppPath).mockReturnValue(folder);
    const binary = path.join(folder, "native-game");
    const iso = path.join(folder, "test.iso");
    await writeFile(iso, "synthetic fixture");
    const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const fixture = path.join(__dirname, "fixtures/native_game.cjs");
    await writeFile(binary, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`, { mode: 0o700 });
    settings = {
      isoPath: iso,
      satsArenaDolphinBinaryPath: binary,
      satsArenaWalletBackend: "nwc",
      satsArenaSatsPerPercent: 1,
    } as SettingsSchema;
    vi.stubEnv("ARENA_TEST_REPORT", path.join(folder, "report.json"));
    vi.stubEnv("SATS_ARENA_NWC_URI", "");
    vi.stubEnv("SATS_ARENA_WALLET_BACKEND", "nwc");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(folder, { recursive: true, force: true });
  });
  it("spawns a child that receives exactly one config line, with no URI in args or production env", async () => {
    const game = new SatsArenaNativeGame(
      { get: () => ({ settings }) } as SettingsManager,
      { get: async () => uri } as NwcSecretStore,
    );
    await game.start();
    const reportPath = path.join(folder, "report.json");
    let report:
      | { args: string[]; payload: unknown; uriInEnvironment: string | null; transport: string; lines: number }
      | undefined;
    for (let i = 0; i < 100; ++i) {
      try {
        report = JSON.parse(await readFile(reportPath, "utf8"));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    expect(report).toBeDefined();
    expect(report!.payload).toEqual({ version: 1, backend: "nwc", nwc_uri: uri });
    expect(report!.transport).toBe("stdin");
    expect(report!.lines).toBe(1);
    expect(report!.uriInEnvironment).toBeNull();
    expect(report!.args.join(" ")).not.toContain(uri);
    expect(report!.args).toEqual(["-b", "-e", settings.isoPath, "-u", path.join(folder, "sats-arena", "dolphin-user")]);
    expect(await readFile(path.join(folder, "sats-arena/dolphin-user/GameSettings/GALE01.ini"), "utf8")).toContain(
      "041BFA20 38600002",
    );
    expect(JSON.stringify(settings)).not.toContain(uri);
  });
  it.skipIf(process.platform !== "linux")(
    "prefers the container wrapper only for an existing sibling build",
    async () => {
      const checkout = path.join(folder, "Ishiiruka");
      const native = path.join(checkout, "build-arena", "Binaries", "dolphin-emu");
      const wrapper = path.join(checkout, "Tools", "arena", "launch-native.sh");
      await mkdir(path.dirname(native), { recursive: true });
      await mkdir(path.dirname(wrapper), { recursive: true });
      await writeFile(native, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      await writeFile(wrapper, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      expect(await findNativeGameBinary(null)).toBe(wrapper);
      await rm(native);
      await expect(findNativeGameBinary(null)).rejects.toThrow("Build or select");
    },
  );
  it.skipIf(process.platform !== "linux")(
    "retains direct native discovery when a container wrapper is absent",
    async () => {
      const native = path.join(folder, "Ishiiruka", "build-arena", "Binaries", "dolphin-emu");
      await mkdir(path.dirname(native), { recursive: true });
      await writeFile(native, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      expect(await findNativeGameBinary(null)).toBe(native);
    },
  );
  it("does not spawn a live child when the saved connection is absent", async () => {
    const game = new SatsArenaNativeGame(
      { get: () => ({ settings }) } as SettingsManager,
      { get: async () => null } as NwcSecretStore,
    );
    await expect(game.start()).rejects.toThrow("Save an NWC");
    await expect(readFile(path.join(folder, "report.json"))).rejects.toThrow();
  });
});
