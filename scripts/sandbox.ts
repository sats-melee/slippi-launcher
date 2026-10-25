/** Agent-friendly sandbox setup. Never reads the user's live NWC connection. */
import { chmod, readFile, rename, writeFile } from "fs/promises";
import { homedir } from "os";
import path from "path";

import { SandboxWallets } from "../src/sats_arena/sandbox";

async function main() {
  const root = path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "Slippi Launcher");
  const sandbox = new SandboxWallets(path.join(root, "sats-arena", "sandbox"));
  const command = process.argv[2] ?? "status";
  if (command === "topup") {
    console.log(JSON.stringify(await sandbox.topUp(), null, 2));
    return;
  }
  if (command === "setup" || command === "prepare") {
    await sandbox.ensure();
    if (command === "prepare") {
      console.log(JSON.stringify(await sandbox.info(), null, 2));
      return;
    }
    const filename = path.join(root, "Settings");
    let settings;
    try {
      settings = JSON.parse(await readFile(filename, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Could not read launcher settings; leaving them unchanged.");
      }
      settings = {};
    }
    settings.settings = { ...settings.settings, satsArenaWalletBackend: "sandbox" };
    await writeFile(filename + ".sandbox.tmp", JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
    await chmod(filename + ".sandbox.tmp", 0o600);
    await rename(filename + ".sandbox.tmp", filename);
  } else if (command !== "status") {
    throw new Error("Usage: scripts/sandbox.sh [setup|prepare|status|topup]");
  }
  console.log(JSON.stringify(await sandbox.info(), null, 2));
}
void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
