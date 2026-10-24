// Tiny real HTTP child process for testing process management without a wallet.
const fs = require("fs");
const http = require("http");

const config = fs.readFileSync(process.argv[2], "utf8");
if (config.includes('invite_code = "fail-startup"')) {
  console.error("fixture: startup failure");
  process.exit(2);
}
const address = JSON.parse(config.match(/^listen = (.+)$/m)[1]);
const [host, port] = address.split(":");
const server = http.createServer((req, res) => {
  res.end(req.url === "/health" ? "ok" : process.env.SATS_ARENA_NWC_URI || "");
});
server.listen(Number(port), host);
process.on("SIGINT", () => server.close(() => process.exit(0)));
