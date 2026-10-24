import type { SettingsManager } from "@settings/settings_manager";
import type { SettingsSchema } from "@settings/types";
import { app } from "electron";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createServer } from "net";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NwcSecretStore } from "./nwc_secret_store";
import { checkHealth, SatsArenaServerProcess } from "./server_process";
import type { SatsArenaServerStatus } from "./types";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(), getAppPath: vi.fn(), isPackaged: false },
}));

// These tests actually spawn a child, so they exercise readiness and shutdown,
// not just the happy path of a mocked spawn(). The wrapper is POSIX-only.
describe.skipIf(process.platform === "win32")("SatsArenaServerProcess", () => {
  let folder: string;
  let settings: SettingsSchema;
  let server: SatsArenaServerProcess;
  let states: SatsArenaServerStatus[];
  const secrets = { get: vi.fn<() => Promise<string | null>>() };

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "arena-process-test-"));
    vi.mocked(app.getPath).mockReturnValue(folder);
    vi.mocked(app.getAppPath).mockReturnValue(folder);
    const binary = path.join(folder, "test-server");
    const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
    const fixture = path.join(__dirname, "fixtures/server.cjs");
    await writeFile(binary, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`, { mode: 0o700 });
    settings = {
      satsArenaMode: "host",
      satsArenaServerBinaryPath: binary,
      satsArenaHostPort: await unusedPort(),
      satsArenaHostAllowRemote: false,
      satsArenaWalletBackend: "fake",
      satsArenaInviteCode: "friends",
      satsArenaSatsPerPercent: 1,
      satsArenaWinSats: 100,
      satsArenaMaxDepositSats: 10000,
    } as SettingsSchema;
    secrets.get.mockResolvedValue(null);
    states = [];
    server = new SatsArenaServerProcess(
      { get: () => ({ settings }) } as SettingsManager,
      secrets as unknown as NwcSecretStore,
      (status) => states.push(status),
    );
  });

  afterEach(async () => {
    await server.stop();
    await rm(folder, { recursive: true, force: true });
  });

  it("starts, checks health and stops its own child", async () => {
    const status = await server.start();
    expect(status.state).toBe("running");
    const url = `http://127.0.0.1:${settings.satsArenaHostPort}`;
    expect((await checkHealth(url)).ok).toBe(true);
    expect(await server.stop()).toEqual({ state: "stopped" });
    expect((await checkHealth(url)).ok).toBe(false);
  });

  it("serializes repeated starts and a stop during startup", async () => {
    const results = await Promise.all([server.start(), server.start(), server.stop()]);
    expect(results.map((result) => result.state)).toEqual(["running", "running", "stopped"]);
    expect(states.filter((status) => status.state === "starting")).toHaveLength(1);
  });

  it("passes NWC only through the child's environment", async () => {
    settings.satsArenaWalletBackend = "nwc";
    const uri = "nostr+walletconnect://test?secret=not-a-real-key";
    secrets.get.mockResolvedValue(uri);
    expect((await server.start()).state).toBe("running");
    const response = await fetch(`http://127.0.0.1:${settings.satsArenaHostPort}/test-env`);
    expect(await response.text()).toBe(uri);
    const config = await readFile(path.join(folder, "sats-arena/server.toml"), "utf8");
    expect(config).not.toContain(uri);
    expect(config).not.toContain("nwc_uri");
    expect(server.getLogs()).not.toContain(uri);
  });

  it("keeps fake and real ledgers separate", async () => {
    await server.start();
    const fakeConfig = await readFile(path.join(folder, "sats-arena/server.toml"), "utf8");
    expect(fakeConfig).toContain("fake.db");
    await server.stop();
    settings.satsArenaWalletBackend = "nwc";
    secrets.get.mockResolvedValue("nostr+walletconnect://test");
    await server.start();
    const realConfig = await readFile(path.join(folder, "sats-arena/server.toml"), "utf8");
    expect(realConfig).toContain("sats-arena.db");
    expect(realConfig).not.toContain("fake.db");
  });

  it("returns a useful error on early exit and can then restart", async () => {
    settings.satsArenaInviteCode = "fail-startup";
    const status = await server.start();
    expect(status).toEqual({ state: "stopped", lastError: "fixture: startup failure" });
    settings.satsArenaInviteCode = "friends";
    expect((await server.start()).state).toBe("running");
  });

  it("handles a missing binary and missing NWC string without getting stuck", async () => {
    const binary = settings.satsArenaServerBinaryPath;
    settings.satsArenaServerBinaryPath = "/does-not-exist/sats-arena-server";
    expect(await server.start()).toMatchObject({ state: "stopped", lastError: expect.stringContaining("executable") });
    settings.satsArenaServerBinaryPath = binary;
    settings.satsArenaWalletBackend = "nwc";
    expect(await server.start()).toMatchObject({ state: "stopped", lastError: expect.stringContaining("Save an NWC") });
  });

  it("doesn't mistake another listening server for the child", async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(settings.satsArenaHostPort, "127.0.0.1", resolve));
    try {
      expect(await server.start()).toMatchObject({ state: "stopped", lastError: expect.stringContaining("Port") });
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("recovers after the OS refuses to execute a file", async () => {
    const binary = settings.satsArenaServerBinaryPath;
    settings.satsArenaServerBinaryPath = folder; // A directory passes access(X_OK), but cannot be spawned.
    expect((await server.start()).state).toBe("stopped");
    settings.satsArenaServerBinaryPath = binary;
    expect((await server.start()).state).toBe("running");
  });
});

describe("checkHealth", () => {
  it("rejects invalid URLs and non-HTTP schemes", async () => {
    expect((await checkHealth("invalid")).ok).toBe(false);
    expect((await checkHealth("file:///tmp/example")).ok).toBe(false);
  });
});

async function unusedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string") {
    throw new Error("No test port assigned");
  }
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}
