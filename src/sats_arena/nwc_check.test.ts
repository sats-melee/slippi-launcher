import { chmod, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, expect, it, vi } from "vitest";

import { checkSavedNwc, runWalletCheck } from "./nwc_check";

vi.mock("electron", () => ({ app: {} }));
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});
const uri = "nostr+walletconnect://private-fixture?secret=must-not-leak";
async function fixture(body: string) {
  const folder = await mkdtemp(path.join(tmpdir(), "wallet-check-"));
  folders.push(folder);
  const binary = path.join(folder, "checker");
  await writeFile(binary, "#!/usr/bin/python3\nimport sys,json,os\n" + body);
  await chmod(binary, 0o755);
  return binary;
}

it("hands credentials over stdin and explicitly opts into invoice creation", async () => {
  const binary = await fixture(`config=json.load(sys.stdin)
assert config==${JSON.stringify({ version: 1, backend: "nwc", nwc_uri: uri })}
assert sys.argv[1:]==['--invoice']
assert 'SATS_ARENA_NWC_URI' not in os.environ
assert 'SATS_ARENA_WALLET_BACKEND' not in os.environ
print(json.dumps(dict(ok=True,message='Invoice created',invoice='lnbc1fixture',amount_sats=1,qr_svg="<svg xmlns='http://www.w3.org/2000/svg'/>")))
`);
  const result = await runWalletCheck(binary, uri, true);
  expect(result).toMatchObject({ ok: true, invoice: "lnbc1fixture", amount_sats: 1 });
  expect(JSON.stringify(result)).not.toContain(uri);
});

it("a connection check does not request or return an invoice", async () => {
  const binary = await fixture(
    "json.load(sys.stdin)\nassert len(sys.argv)==1\nprint(json.dumps(dict(ok=True,message='Connected',invoice='should-not-return')))\n",
  );
  expect(await runWalletCheck(binary, uri, false)).toEqual({ ok: true, message: "Connected" });
});

it("rejects leaked credentials and incomplete invoice results", async () => {
  const echo = await fixture("c=json.load(sys.stdin)\nprint(json.dumps(dict(ok=False,message=c['nwc_uri'])))\n");
  expect(await runWalletCheck(echo, uri, false)).toEqual({
    ok: false,
    message: "Wallet check returned an invalid response.",
  });
  const invalid = await fixture("json.load(sys.stdin)\nprint(json.dumps(dict(ok=True,message='Connected')))\n");
  expect((await runWalletCheck(invalid, uri, true)).ok).toBe(false);
});

it("requires a saved connection", async () => {
  expect(await checkSavedNwc({ get: async () => null }, null, false)).toEqual({
    ok: false,
    message: "Save an NWC connection first.",
  });
});
