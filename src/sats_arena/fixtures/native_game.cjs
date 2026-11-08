// Synthetic child for private launcher-to-Dolphin handoff tests. No wallet access.
const fs = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.ARENA_TEST_REPORT, JSON.stringify({
    args: process.argv.slice(2),
    transport: process.env.SATS_ARENA_WALLET_CONFIG,
    rooms: process.env.SATS_ARENA_NETPLAY_ROOMS,
    roomServer: process.env.SATS_ARENA_ROOM_SERVER_URL,
    descriptor: process.env.SATS_ARENA_NETPLAY_FILE,
    paymentHost: process.env.SATS_ARENA_FAKE_LOCAL,
    uriInEnvironment: process.env.SATS_ARENA_NWC_URI ?? null,
    payload: input.trim() ? JSON.parse(input.trim()) : null,
    lines: input.trim() ? input.trim().split("\n").length : 0,
  }), { mode: 0o600 });
});
