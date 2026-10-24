import { safeStorage } from "electron";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NwcSecretStore } from "./nwc_secret_store";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    getSelectedStorageBackend: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));

describe("NwcSecretStore", () => {
  let folder: string;
  let store: NwcSecretStore;
  const uri = "nostr+walletconnect://test?secret=only-for-testing";

  beforeEach(async () => {
    vi.resetAllMocks();
    folder = await mkdtemp(path.join(tmpdir(), "arena-secret-test-"));
    store = new NwcSecretStore(folder);
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
    vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue("kwallet6");
    vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from("encrypted-test-value"));
    vi.mocked(safeStorage.decryptString).mockReturnValue(uri);
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("saves using the system keyring and doesn't return the URI through info", async () => {
    expect(await store.set(uri)).toEqual({ saved: true, encrypted: true });
    expect(await readFile(path.join(folder, "nwc.enc"), "utf8")).not.toContain(uri);
    expect(await store.get()).toBe(uri);
    expect(await store.clear()).toEqual({ saved: false, encrypted: true });
    expect(await store.get()).toBeNull();
  });

  it("reports when storage is unencrypted and restricts the file permissions", async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    expect(await store.set(uri)).toEqual({ saved: true, encrypted: false });
    expect(await store.get()).toBe(uri);
    if (process.platform !== "win32") {
      expect((await stat(path.join(folder, "nwc.txt"))).mode & 0o777).toBe(0o600);
    }
  });

  it("keeps the old value if encrypting a replacement fails", async () => {
    await store.set(uri);
    vi.mocked(safeStorage.encryptString).mockImplementation(() => {
      throw new Error("locked");
    });
    await expect(store.set("nostr+walletconnect://replacement")).rejects.toThrow("locked");
    expect(await store.get()).toBe(uri);
  });

  it("reports a locked keyring instead of treating a saved key as missing", async () => {
    await store.set(uri);
    vi.mocked(safeStorage.decryptString).mockImplementation(() => {
      throw new Error("locked");
    });
    await expect(store.get()).rejects.toThrow("Unlock your system keyring");
  });

  it("rejects malformed values without saving them", async () => {
    await expect(store.set("https://not-nwc")).rejects.toThrow("NWC");
    await expect(store.set("nostr+walletconnect://")).rejects.toThrow("NWC");
    expect((await store.info()).saved).toBe(false);
  });
});
