import { safeStorage } from "electron";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";

import type { SatsArenaNwcInfo } from "./types";

const NWC_PREFIX = "nostr+walletconnect://";

export function isValidNwcUri(uri: string): boolean {
  return uri.startsWith(NWC_PREFIX) && uri.length > NWC_PREFIX.length && !/\s/.test(uri);
}

/**
 * Keeps the NWC connection string out of the settings file. It's encrypted with
 * the OS keyring when one is available; otherwise it's a file only this user
 * can read. Native Arena receives it through a private stdin pipe; the older server
 * prototype receives it through its environment. It is never returned to the renderer.
 */
export class NwcSecretStore {
  constructor(private readonly folder: string) {}

  private get encryptedPath() {
    return path.join(this.folder, "nwc.enc");
  }

  private get plainPath() {
    return path.join(this.folder, "nwc.txt");
  }

  private canEncrypt(): boolean {
    // On Linux without a keyring, Electron's "basic_text" backend is a fixed key, not real encryption.
    return (
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
    );
  }

  async info(): Promise<SatsArenaNwcInfo> {
    const encrypted = await exists(this.encryptedPath);
    const plain = await exists(this.plainPath);
    return { saved: encrypted || plain, encrypted: plain ? false : encrypted || this.canEncrypt() };
  }

  async get(): Promise<string | null> {
    let encrypted: Buffer | undefined;
    try {
      encrypted = await readFile(this.encryptedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Could not read the saved NWC connection string");
      }
    }
    if (encrypted) {
      try {
        return safeStorage.decryptString(encrypted);
      } catch {
        throw new Error("Could not unlock the saved NWC connection string. Unlock your system keyring or replace it.");
      }
    }
    try {
      return (await readFile(this.plainPath, "utf8")).trim() || null;
    } catch {
      return null;
    }
  }

  async set(uri: string): Promise<SatsArenaNwcInfo> {
    const trimmed = uri.trim();
    if (!isValidNwcUri(trimmed)) {
      throw new Error(`That doesn't look like an NWC connection string (it should start with ${NWC_PREFIX})`);
    }
    await mkdir(this.folder, { recursive: true, mode: 0o700 });
    const encrypted = this.canEncrypt();
    const destination = encrypted ? this.encryptedPath : this.plainPath;
    const temporary = `${destination}.tmp`;
    const data = encrypted ? safeStorage.encryptString(trimmed) : trimmed;
    // Write before replacing the old value so a keyring/write failure doesn't lose it.
    await writeFile(temporary, data, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
    await rm(encrypted ? this.plainPath : this.encryptedPath, { force: true });
    return this.info();
  }

  async clear(): Promise<SatsArenaNwcInfo> {
    await rm(this.encryptedPath, { force: true });
    await rm(this.plainPath, { force: true });
    return this.info();
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}
