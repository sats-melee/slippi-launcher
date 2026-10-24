import { sanitizeAppImageEnv } from "@dolphin/app_image_env/app_image_env";
import type { SettingsManager } from "@settings/settings_manager";
import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import { app } from "electron";
import electronLog from "electron-log";
import { access, constants, mkdir, writeFile } from "fs/promises";
import { createServer } from "net";
import path from "path";

import type { NwcSecretStore } from "./nwc_secret_store";
import { buildServerConfig } from "./server_config";
import type { SatsArenaServerStatus } from "./types";

const log = electronLog.scope("sats_arena");

const BINARY_NAME = process.platform === "win32" ? "sats-arena-server.exe" : "sats-arena-server";
const MAX_LOG_CHARS = 64 * 1024;
const STARTUP_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 5_000;

/** Runs the sats-arena-server binary as a child process of the launcher. */
export class SatsArenaServerProcess {
  private child: ChildProcess | null = null;
  private status: SatsArenaServerStatus = { state: "stopped" };
  private logs = "";
  private operation: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly settingsManager: SettingsManager,
    private readonly secrets: NwcSecretStore,
    private readonly onStatusChange: (status: SatsArenaServerStatus) => void,
  ) {}

  getStatus(): SatsArenaServerStatus {
    return this.status;
  }

  getLogs(): string {
    return this.logs;
  }

  start(): Promise<SatsArenaServerStatus> {
    return this.runExclusive(() => this.startProcess());
  }

  stop(): Promise<SatsArenaServerStatus> {
    return this.runExclusive(() => this.stopProcess());
  }

  private async startProcess(): Promise<SatsArenaServerStatus> {
    if (this.child) {
      return this.status;
    }
    this.setStatus({ state: "starting" });
    try {
      await this.spawnServer();
    } catch (err) {
      const message =
        this.status.state === "stopped" && this.status.lastError
          ? this.status.lastError
          : err instanceof Error
          ? err.message
          : String(err);
      log.error(`Could not start the server: ${message}`);
      this.appendLog(`[launcher] ${message}\n`);
      await this.stopProcess();
      this.setStatus({ state: "stopped", lastError: message });
    }
    return this.status;
  }

  private async stopProcess(): Promise<SatsArenaServerStatus> {
    const child = this.child;
    if (!child) {
      return this.status;
    }
    this.setStatus({ state: "stopping" });
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    // The server shuts down cleanly on Ctrl+C (SIGINT).
    this.killChild(process.platform === "win32" ? undefined : "SIGINT");
    const timedOut = await Promise.race([exited.then(() => false), delay(STOP_TIMEOUT_MS).then(() => true)]);
    if (timedOut) {
      log.warn("Server didn't stop in time; killing it");
      this.killChild("SIGKILL");
      await exited;
    }
    return this.status;
  }

  private runExclusive(action: () => Promise<SatsArenaServerStatus>): Promise<SatsArenaServerStatus> {
    const operation = this.operation.then(action);
    this.operation = operation.catch(() => undefined);
    return operation;
  }

  private async spawnServer() {
    const settings = this.settingsManager.get().settings;
    const binary = await findServerBinary(settings.satsArenaServerBinaryPath);

    const env: NodeJS.ProcessEnv = { ...sanitizeAppImageEnv(), SATS_ARENA_NWC_URI: "" };
    if (settings.satsArenaWalletBackend === "nwc") {
      const uri = await this.secrets.get();
      if (!uri) {
        throw new Error("Save an NWC connection string before starting the server with the NWC wallet");
      }
      env.SATS_ARENA_NWC_URI = uri;
    }

    const dataDir = path.join(app.getPath("userData"), "sats-arena");
    const configPath = path.join(dataDir, "server.toml");
    // Never mix pretend balances with a real wallet's ledger.
    const databaseName = settings.satsArenaWalletBackend === "fake" ? "fake.db" : "sats-arena.db";
    const config = buildServerConfig(settings, path.join(dataDir, databaseName));
    await assertPortAvailable(settings.satsArenaHostPort);
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await writeFile(configPath, config, { mode: 0o600 });

    this.logs = "";
    this.appendLog(`[launcher] Starting ${binary}\n`);
    const child = spawn(binary, [configPath], { cwd: dataDir, env, windowsHide: true });
    this.child = child;

    child.stdout?.on("data", (data: Buffer) => this.appendLog(data.toString()));
    child.stderr?.on("data", (data: Buffer) => this.appendLog(data.toString()));
    child.once("close", (code, signal) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      const wasStopping = this.status.state === "stopping";
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      this.appendLog(`[launcher] Server exited (${reason})\n`);
      const lastLine = lastMeaningfulLine(this.logs);
      this.setStatus(
        wasStopping ? { state: "stopped" } : { state: "stopped", lastError: lastLine ?? `Server exited (${reason})` },
      );
    });

    child.on("error", (error) => this.appendLog(`[launcher] ${error.message}\n`));

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });

    const url = `http://127.0.0.1:${settings.satsArenaHostPort}`;
    await waitForHealthy(url, () => this.child === child && child.exitCode === null && child.signalCode === null);
    if (this.child === child) {
      this.setStatus({ state: "running", url, pid: child.pid ?? 0 });
    }
  }

  private killChild(signal?: NodeJS.Signals) {
    try {
      this.child?.kill(signal);
    } catch (err) {
      log.warn(err);
    }
  }

  private appendLog(text: string) {
    // The Rust server uses colored logs even when piped; keep the UI readable.
    // eslint-disable-next-line no-control-regex
    this.logs = (this.logs + text.replace(/\x1b\[[0-9;]*m/g, "")).slice(-MAX_LOG_CHARS);
  }

  private setStatus(status: SatsArenaServerStatus) {
    this.status = status;
    this.onStatusChange(status);
  }
}

/**
 * Looks for the server in order: the path set in settings, a copy bundled
 * with the launcher, then a sibling sats-arena checkout (for development).
 */
async function findServerBinary(configured: string | null): Promise<string> {
  if (configured) {
    if (await isExecutable(configured)) {
      return configured;
    }
    throw new Error(`The server binary at ${configured} doesn't exist or isn't executable`);
  }
  const resources = app.isPackaged ? path.join(process.resourcesPath, "assets") : path.join(app.getAppPath(), "assets");
  const candidates = [path.join(resources, "include", "sats-arena", BINARY_NAME)];
  if (!app.isPackaged) {
    // The app path differs between `npm start` and running a build, so check a few parents.
    let dir = app.getAppPath();
    for (let i = 0; i < 4; i++) {
      dir = path.dirname(dir);
      const target = path.join(dir, "sats-arena", "target");
      candidates.push(path.join(target, "release", BINARY_NAME), path.join(target, "debug", BINARY_NAME));
    }
  }
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Couldn't find ${BINARY_NAME}. Build it, or set its location under Advanced. Looked in:\n${candidates.join("\n")}`,
  );
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error(`Port ${port} is unavailable. Stop the other server or choose another port.`)),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
}

async function waitForHealthy(url: string, stillRunning: () => boolean) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!stillRunning()) {
      throw new Error("The server exited during startup. Check its logs.");
    }
    if ((await checkHealth(url)).ok) {
      return;
    }
    await delay(250);
  }
  throw new Error("The server didn't respond within 10 seconds. Check its logs.");
}

export async function checkHealth(url: string): Promise<{ ok: boolean; message: string }> {
  let healthUrl: URL;
  try {
    healthUrl = new URL("health", url.endsWith("/") ? url : `${url}/`);
  } catch {
    return { ok: false, message: "That isn't a valid URL" };
  }
  if (healthUrl.protocol !== "http:" && healthUrl.protocol !== "https:") {
    return { ok: false, message: "The URL must start with http:// or https://" };
  }
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    const body = (await res.text()).trim();
    return res.ok && body === "ok"
      ? { ok: true, message: "Connected" }
      : { ok: false, message: `Unexpected response (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function lastMeaningfulLine(logs: string): string | undefined {
  return logs
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("[launcher]"))
    .pop();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
