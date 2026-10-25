import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SandboxWallets } from "./sandbox";

let folder: string;
const walletUri = (index: number) =>
  `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(
    64,
  )}&lud16=nwc${index}@getalby.com`;
beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "arena-sandbox-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

it("creates five private wallets once, including concurrent callers, and returns only public addresses", async () => {
  let index = 0;
  const request = vi.fn(async () => new Response(walletUri(index++)));
  const first = new SandboxWallets(folder, request as typeof fetch);
  const second = new SandboxWallets(folder, request as typeof fetch);
  expect(await first.info()).toEqual({ ready: false, addresses: [] });
  await Promise.all([first.ensure(), first.ensure(), second.ensure()]);
  expect(request).toHaveBeenCalledTimes(5);
  expect(request).toHaveBeenCalledWith("https://faucet.nwc.dev?balance=10000", {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  const info = await second.info();
  expect(info).toEqual({ ready: true, addresses: [1, 2, 3, 4].map((n) => `nwc${n}@getalby.com`) });
  expect(JSON.stringify(info)).not.toContain("secret");
  expect((await stat(path.join(folder, "wallets.json"))).mode & 0o777).toBe(0o600);
  await new SandboxWallets(folder, request as typeof fetch).ensure();
  expect(request).toHaveBeenCalledTimes(5);
});

it("preserves partial setup after provider failure and resumes it without replacing existing wallets", async () => {
  let index = 0;
  const request = vi.fn(async () => {
    if (index === 2) {
      ++index;
      throw new Error("provider error with private details");
    }
    return new Response(walletUri(index++));
  });
  await expect(new SandboxWallets(folder, request as typeof fetch).ensure()).rejects.toThrow(
    "Alby sandbox is unavailable",
  );
  const partial = JSON.parse(await readFile(path.join(folder, "wallets.json"), "utf8"));
  expect(partial.wallets).toHaveLength(2);
  const completed = await new SandboxWallets(folder, request as typeof fetch).ensure();
  expect(completed.wallets.slice(0, 2)).toEqual(partial.wallets);
  expect(completed.wallets).toHaveLength(5);
});

it("does not replace a corrupt fixture or echo provider credential material", async () => {
  const request = vi.fn(async () => new Response("private-invalid-wallet-secret"));
  await expect(new SandboxWallets(folder, request as typeof fetch).ensure()).rejects.toThrow(
    "invalid or duplicate test wallet",
  );
  await writeFile(path.join(folder, "wallets.json"), "broken private fixture");
  await expect(new SandboxWallets(folder, request as typeof fetch).ensure()).rejects.toThrow(
    "Could not read sandbox wallets",
  );
  expect(await readFile(path.join(folder, "wallets.json"), "utf8")).toBe("broken private fixture");
});

it("tops up the existing five wallets without rotating their connections", async () => {
  let index = 0;
  const request = vi.fn(async () => new Response(walletUri(index++)));
  const sandbox = new SandboxWallets(folder, request as typeof fetch);
  const fixture = await sandbox.ensure();
  await sandbox.topUp();
  expect(request).toHaveBeenCalledTimes(10);
  expect(request).toHaveBeenNthCalledWith(6, "https://faucet.nwc.dev/wallets/nwc0/topup?amount=10000", {
    method: "POST",
    signal: expect.any(AbortSignal),
  });
  expect(await sandbox.ensure()).toEqual(fixture);
  expect(request).toHaveBeenCalledTimes(10);
});
