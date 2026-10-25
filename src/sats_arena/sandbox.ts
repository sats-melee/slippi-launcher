import { chmod, mkdir, open, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";

export type SandboxWallet = { uri: string; address: string };
export type SandboxFixture = { version: 1; wallets: SandboxWallet[] };
export type SandboxInfo = { ready: boolean; addresses: string[] };
const FAUCET = "https://faucet.nwc.dev";

/** Reusable private fixture: Arena first, then P1–P4. Never touches the live NWC store. */
export class SandboxWallets {
  private pending?: Promise<SandboxFixture>;
  constructor(private readonly folder: string, private readonly request: typeof fetch = fetch) {}

  async info(): Promise<SandboxInfo> {
    const fixture = await this.read();
    return { ready: fixture.wallets.length === 5, addresses: fixture.wallets.slice(1).map((w) => w.address) };
  }

  ensure(): Promise<SandboxFixture> {
    if (!this.pending) {
      this.pending = this.provision().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  async topUp(): Promise<SandboxInfo> {
    const fixture = await this.ensure();
    for (const wallet of fixture.wallets) {
      const username = wallet.address.split("@")[0];
      let response: Response;
      try {
        response = await this.request(`${FAUCET}/wallets/${encodeURIComponent(username)}/topup?amount=10000`, {
          method: "POST",
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        throw new Error("Alby sandbox top-up is unavailable. Retry later.");
      }
      if (!response.ok) {
        throw new Error("Alby sandbox top-up failed. Existing wallets were preserved.");
      }
    }
    return this.info();
  }

  private async read(): Promise<SandboxFixture> {
    let fixture: SandboxFixture;
    try {
      fixture = JSON.parse(await readFile(path.join(this.folder, "wallets.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, wallets: [] };
      }
      throw new Error("Could not read sandbox wallets; preserve the fixture and check its permissions.");
    }
    if (
      !fixture ||
      fixture.version !== 1 ||
      !Array.isArray(fixture.wallets) ||
      fixture.wallets.length > 5 ||
      !fixture.wallets.every(validWallet)
    ) {
      throw new Error("The saved sandbox wallet fixture is invalid; it has not been replaced.");
    }
    return fixture;
  }

  private async provision(): Promise<SandboxFixture> {
    await mkdir(this.folder, { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.folder, ".setup.lock");
    let lock;
    for (let attempt = 0; !lock && attempt < 600; ++attempt) {
      try {
        lock = await open(lockPath, "wx", 0o600);
        await lock.writeFile(String(process.pid));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw new Error("Could not lock sandbox setup.");
        }
        try {
          const pid = Number(await readFile(lockPath, "utf8"));
          if (pid > 0) {
            try {
              process.kill(pid, 0);
            } catch (check) {
              if ((check as NodeJS.ErrnoException).code === "ESRCH") {
                await unlink(lockPath);
              }
            }
          }
        } catch {
          /* Another setup process may have just finished. */
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!lock) {
      throw new Error("Sandbox setup is still running in another process.");
    }
    try {
      const fixture = await this.read();
      while (fixture.wallets.length < 5) {
        let response: Response;
        try {
          response = await this.request(`${FAUCET}?balance=10000`, {
            method: "POST",
            signal: AbortSignal.timeout(30000),
          });
        } catch {
          throw new Error("Alby sandbox is unavailable. Retry when the faucet is reachable.");
        }
        if (!response.ok) {
          throw new Error("Alby sandbox could not create a test wallet. Retry setup later.");
        }
        const uri = (await response.text()).trim();
        let address = "";
        try {
          address = new URL(uri).searchParams.get("lud16") ?? "";
        } catch {
          /* Validated below. */
        }
        const wallet = { uri, address };
        if (!validWallet(wallet) || fixture.wallets.some((w) => w.address === address)) {
          throw new Error("Alby sandbox returned an invalid or duplicate test wallet.");
        }
        fixture.wallets.push(wallet);
        const temporary = path.join(this.folder, "wallets.json.tmp");
        await writeFile(temporary, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
        await chmod(temporary, 0o600);
        await rename(temporary, path.join(this.folder, "wallets.json"));
      }
      return fixture;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
}

function validWallet(wallet: SandboxWallet): boolean {
  try {
    const uri = new URL(wallet.uri);
    return (
      uri.protocol === "nostr+walletconnect:" &&
      /^[0-9a-f]{64}$/i.test(uri.hostname) &&
      /^[0-9a-f]{64}$/i.test(uri.searchParams.get("secret") ?? "") &&
      uri.searchParams.getAll("relay").length > 0 &&
      uri.searchParams.getAll("relay").every((r) => new URL(r).protocol === "wss:") &&
      /^nwc[a-z0-9]+@getalby\.com$/.test(wallet.address) &&
      uri.searchParams.get("lud16") === wallet.address
    );
  } catch {
    return false;
  }
}
