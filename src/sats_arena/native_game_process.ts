import { sanitizeAppImageEnv } from "@dolphin/app_image_env/app_image_env";
import type { SettingsManager } from "@settings/settings_manager";
import type { SettingsSchema } from "@settings/types";
import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import { app } from "electron";
import { access, constants, mkdir, stat } from "fs/promises";
import path from "path";

import { prepareLocalGameProfile } from "./local_game_profile";
import { localRulesError } from "./local_rules";
import type { NwcSecretStore } from "./nwc_secret_store";
import { isValidNwcUri } from "./nwc_secret_store";
import type { SandboxWallets } from "./sandbox";

type WalletPayload = {
  version: 1;
  backend: "fake" | "sandbox" | "nwc";
  nwc_uri?: string;
  sandbox_players?: { nwc_uri: string; address: string }[];
};
type NativeSettings = Pick<
  SettingsSchema,
  "satsArenaWalletBackend" | "satsArenaEntrySats" | "satsArenaSatsPerPercent"
> &
  Partial<Pick<SettingsSchema, "satsArenaSurchargePercent" | "satsArenaBatchSeconds">>;

/** Only the main process calls this; the resulting secret is never returned over IPC. */
export async function nativeWalletLaunch(
  settings: NativeSettings,
  secrets: Pick<NwcSecretStore, "get">,
  inherited: NodeJS.ProcessEnv,
  sandbox?: Pick<SandboxWallets, "ensure">,
): Promise<{ payload: WalletPayload; env: NodeJS.ProcessEnv }> {
  const uriOverride = inherited.SATS_ARENA_NWC_URI?.trim() || undefined;
  const backendOverride = inherited.SATS_ARENA_WALLET_BACKEND;
  if (backendOverride !== undefined && !["fake", "sandbox", "nwc"].includes(backendOverride)) {
    throw new Error("SATS_ARENA_WALLET_BACKEND must be fake or nwc or sandbox");
  }
  if ((backendOverride === "sandbox" || settings.satsArenaWalletBackend === "sandbox") && uriOverride) {
    throw new Error("Clear the development NWC override before using Sandbox.");
  }
  if (backendOverride === "fake" && uriOverride) {
    throw new Error("The development NWC connection conflicts with the explicit fake wallet setting");
  }
  const backend = (backendOverride ??
    (uriOverride ? "nwc" : settings.satsArenaWalletBackend)) as WalletPayload["backend"];
  const payload: WalletPayload = { version: 1, backend };
  if (backend === "sandbox") {
    if (!sandbox) {
      throw new Error("Sandbox setup is not available.");
    }
    const fixture = await sandbox.ensure();
    payload.nwc_uri = fixture.wallets[0].uri;
    payload.sandbox_players = fixture.wallets
      .slice(1)
      .map((wallet) => ({ nwc_uri: wallet.uri, address: wallet.address }));
  }
  if (backend === "nwc") {
    const uri = uriOverride ?? (await secrets.get());
    if (!uri) {
      throw new Error("Save an NWC connection in Wallet settings before playing with Lightning");
    }
    if (!isValidNwcUri(uri)) {
      throw new Error("The NWC connection is invalid; replace it in Wallet settings");
    }
    payload.nwc_uri = uri;
  }
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    SATS_ARENA_WALLET_CONFIG: "stdin",
  };
  // Electron's AppRun disables AT-SPI for itself; native GTK controls need their own bridge.
  delete env.NO_AT_BRIDGE;
  // Never reuse a descriptor or disabled payment-gate flag from another launcher.
  delete env.SATS_ARENA_WALLET_CONFIG_FD;
  delete env.SATS_ARENA_FAKE_LOCAL;
  // The saved URI travels only through stdin. A deliberate dev override stays a dev override.
  if (!uriOverride) {
    delete env.SATS_ARENA_NWC_URI;
  }
  const entry = env.SATS_ARENA_ENTRY_SATS ?? String(settings.satsArenaEntrySats);
  const rate = env.SATS_ARENA_SATS_PER_PERCENT ?? String(settings.satsArenaSatsPerPercent);
  if (!/^\d+$/.test(entry) || !/^\d+$/.test(rate)) {
    throw new Error("Local match amounts must be whole numbers of sats.");
  }
  const batch = env.SATS_ARENA_BATCH_SECONDS ?? String(settings.satsArenaBatchSeconds ?? 5);
  const surcharge = env.SATS_ARENA_SURCHARGE_BPS ?? String(Math.round((settings.satsArenaSurchargePercent ?? 2) * 100));
  if (!/^\d+$/.test(batch) || !/^\d+$/.test(surcharge)) {
    throw new Error("Payout delay and surcharge basis points must be whole numbers.");
  }
  const rulesError = localRulesError(
    Number(entry),
    Number(rate),
    Number(batch),
    env.SATS_ARENA_SURCHARGE_BPS === undefined ? settings.satsArenaSurchargePercent ?? 2 : Number(surcharge) / 100,
  );
  if (rulesError) {
    throw new Error(rulesError);
  }
  env.SATS_ARENA_BATCH_SECONDS = batch;
  env.SATS_ARENA_SURCHARGE_BPS = surcharge;
  env.SATS_ARENA_ENTRY_SATS = entry;
  env.SATS_ARENA_SATS_PER_PERCENT = rate;
  return { payload, env };
}

/** Dedicated local Arena child. Replay, netplay and ordinary Dolphin never use this handoff. */
export class SatsArenaNativeGame {
  private child: ChildProcess | null = null;
  private starting = false;

  constructor(
    private readonly settingsManager: SettingsManager,
    private readonly secrets: NwcSecretStore,
    private readonly sandbox?: SandboxWallets,
  ) {}

  async start(): Promise<void> {
    if (this.child || this.starting) {
      throw new Error("A local Arena game is already open");
    }
    this.starting = true;
    try {
      const settings = this.settingsManager.get().settings;
      if (!settings.isoPath || !(await isFile(settings.isoPath))) {
        throw new Error("Choose an existing Melee ISO in Game settings before playing");
      }
      const binary = await findNativeGameBinary(settings.satsArenaDolphinBinaryPath);
      const launch = await nativeWalletLaunch(settings, this.secrets, { ...sanitizeAppImageEnv() }, this.sandbox);
      const userPath = path.join(app.getPath("userData"), "sats-arena", "dolphin-user");
      await mkdir(userPath, { recursive: true, mode: 0o700 });
      const configRoot = app.getPath("appData");
      await prepareLocalGameProfile(userPath, [
        path.join(configRoot, "SatsArenaDolphin"),
        path.join(configRoot, "SlippiOnline"),
      ]);
      const child = spawn(binary, ["-b", "-e", settings.isoPath, "-u", userPath], {
        env: launch.env,
        // Dolphin does not read stdin for gameplay. A closed private pipe works on all platforms.
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
      this.child = child;
      child.once("close", () => {
        if (this.child === child) {
          this.child = null;
        }
      });
      // Never log the child object or its errors: a provider might echo credential material.
      child.on("error", () => undefined);
      await new Promise<void>((resolve, reject) => {
        child.once("error", () => reject(new Error("Could not launch the local Arena game")));
        child.once("spawn", () => {
          const input = child.stdin;
          if (!input) {
            child.kill();
            reject(new Error("Could not open the private Arena wallet handoff"));
            return;
          }
          input.once("error", () => {
            child.kill();
            reject(new Error("The local game closed its wallet handoff before configuration completed"));
          });
          input.end(`${JSON.stringify(launch.payload)}\n`, () => resolve());
        });
      });
    } catch (error) {
      this.child?.kill();
      this.child = null;
      throw error;
    } finally {
      this.starting = false;
    }
  }
}

export async function findNativeGameBinary(configured: string | null): Promise<string> {
  if (configured) {
    if (await executable(configured)) {
      return configured;
    }
    throw new Error("The selected Arena Dolphin program is missing or is not executable");
  }
  const name = process.platform === "win32" ? "dolphin-emu.exe" : "dolphin-emu";
  const assets = app.isPackaged ? path.join(process.resourcesPath, "assets") : path.join(app.getAppPath(), "assets");
  const includeDir = path.join(assets, "include", "sats-arena");
  const candidates = [path.join(includeDir, name)];
  if (process.platform === "darwin") {
    // Packaged macOS builds ship the signed app bundle; its dylibs only resolve inside it.
    candidates.unshift(path.join(includeDir, "Slippi Dolphin.app", "Contents", "MacOS", "Slippi Dolphin"));
  }
  if (!app.isPackaged) {
    let folder = app.getAppPath();
    for (let i = 0; i < 5; i++) {
      const checkout = path.join(folder, "Ishiiruka");
      const binary = path.join(checkout, "build-arena", "Binaries", name);
      // SteamOS cannot directly load the Ubuntu build's shared libraries.
      // Only prefer the container wrapper when this checkout has a real build.
      if (process.platform === "linux" && (await executable(binary))) {
        candidates.push(path.join(checkout, "Tools", "arena", "launch-native.sh"));
      }
      candidates.push(binary);
      folder = path.dirname(folder);
    }
  }
  for (const candidate of candidates) {
    if (await executable(candidate)) {
      return candidate;
    }
  }
  throw new Error("Build or select the Arena Dolphin program in local game settings before playing");
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
async function executable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return await isFile(file);
  } catch {
    return false;
  }
}
