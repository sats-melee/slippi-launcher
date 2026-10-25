// Synthetic child for private launcher-to-Dolphin handoff tests. No wallet access.
const fs = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.ARENA_TEST_REPORT, JSON.stringify({
    args: process.argv.slice(2),
    transport: process.env.SATS_ARENA_WALLET_CONFIG,
    uriInEnvironment: process.env.SATS_ARENA_NWC_URI ?? null,
    payload: JSON.parse(input.trim()),
    lines: input.trim().split("\n").length,
  }), { mode: 0o600 });
});
