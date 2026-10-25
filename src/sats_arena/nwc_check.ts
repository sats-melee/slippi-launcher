import { sanitizeAppImageEnv } from "@dolphin/app_image_env/app_image_env";
import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import path from "path";

import { findNativeGameBinary } from "./native_game_process";
import type { NwcSecretStore } from "./nwc_secret_store";
import type { SatsArenaNwcCheck } from "./types";

/** Check the saved connection using the same native NWC adapter as gameplay.
 * No secret leaves main except over the private child stdin pipe. No payments.
 */
export async function checkSavedNwc(
  secrets: Pick<NwcSecretStore, "get">,
  configured: string | null,
  createInvoice: boolean,
): Promise<SatsArenaNwcCheck> {
  const uri = await secrets.get();
  if (!uri) {
    return { ok: false, message: "Save an NWC connection first." };
  }
  const native = await findNativeGameBinary(configured);
  const name =
    path.basename(native) === "launch-native.sh"
      ? "check-wallet.sh"
      : process.platform === "win32"
      ? "sats-arena-wallet-check.exe"
      : "sats-arena-wallet-check";
  const binary = path.join(path.dirname(native), name);
  try {
    await access(binary, constants.X_OK);
  } catch {
    return { ok: false, message: "Rebuild the Arena runtime to enable wallet checks." };
  }
  return runWalletCheck(binary, uri, createInvoice);
}

export function runWalletCheck(binary: string, uri: string, createInvoice: boolean): Promise<SatsArenaNwcCheck> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...sanitizeAppImageEnv(), SATS_ARENA_WALLET_CONFIG: "stdin" };
    delete env.SATS_ARENA_NWC_URI;
    delete env.SATS_ARENA_WALLET_BACKEND;
    const child = spawn(binary, createInvoice ? ["--invoice"] : [], {
      env,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    let output = "";
    let done = false;
    const finish = (result: SatsArenaNwcCheck) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, message: "Wallet check timed out. Check your wallet is online and its relay is reachable." });
    }, 50000);
    child.on("error", () => finish({ ok: false, message: "Could not start the wallet check." }));
    child.stdin.on("error", () =>
      finish({ ok: false, message: "Wallet check closed before configuration completed." }),
    );
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.length > 256000) {
        child.kill();
        finish({ ok: false, message: "Wallet check returned an invalid response." });
      }
    });
    child.on("close", () => {
      try {
        const value = JSON.parse(output);
        if (
          typeof value.ok !== "boolean" ||
          typeof value.message !== "string" ||
          output.includes(uri) ||
          output.includes("nostr+walletconnect://")
        ) {
          throw new Error();
        }
        if (
          value.ok &&
          createInvoice &&
          (!/^lnbc[0-9a-z]+$/i.test(value.invoice) ||
            value.amount_sats !== 1 ||
            typeof value.qr_svg !== "string" ||
            !value.qr_svg.startsWith("<svg "))
        ) {
          throw new Error();
        }
        finish({
          ok: value.ok,
          message: value.message,
          ...(value.ok && createInvoice ? { invoice: value.invoice, qr_svg: value.qr_svg, amount_sats: 1 } : {}),
        });
      } catch {
        finish({ ok: false, message: "Wallet check returned an invalid response." });
      }
    });
    child.stdin.end(JSON.stringify({ version: 1, backend: "nwc", nwc_uri: uri }) + "\n");
  });
}
