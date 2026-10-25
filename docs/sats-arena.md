# Sats Arena launcher

Use **Play local Arena** for the embedded game/sidebar flow and the saved wallet.
See [native wallet handoff](native-wallet.md) for production and development setup.
The server controls below remain a separate remote prototype.

Open **Settings → Sats Arena** in the launcher.

The launcher now opens directly on the Arena screen, which also includes the
server controls. It does not restore Slippi launcher accounts or require login,
email verification, policy acceptance, or online activation. Replay, news,
tournament, spectate, and console pages are not in the active navigation;
their implementation is retained for possible later use. Old links redirect
to Arena rather than opening these screens. Existing Dolphin play keys are
left alone; Slippi's own online servers still require their usual credentials.

- **Off:** don't use an arena server. Leaving Host mode stops the child process.
- **Connect to a server:** save the URL of an independently hosted server and
  use **Test connection** to check its `/health` endpoint. This doesn't log in,
  register a player, or send match reports yet.
- **Host a server:** configure a local server, then press **Start server**.
  **Stop server**, **Test connection**, and **Show logs** are available here.
  The launcher also stops its child server when it quits. It never stops a
  server it didn't start. Hosting isn't started automatically on launch.

## Local hosting

1. Build [sats-arena](https://github.com/landaverdend/sats-arena):
   `cargo build --release -p sats-arena-server`.
2. The development launcher finds `target/release/sats-arena-server` (or the
   debug version) in an adjacent `sats-arena` checkout. Otherwise select the
   executable under **Advanced → Server program**. For packaged releases, a
   platform-specific copy can be included at
   `assets/include/sats-arena/sats-arena-server` (`.exe` on Windows).
3. Select **Fake wallet**, generate an invite code, and press **Start server**.
4. The default local URL is `http://127.0.0.1:8737`. Change the port if needed.

The server is a separate Rust program, not an implementation embedded in
Electron. It stays usable on its own on a Pi/VPS. The launcher generates its
TOML config and keeps the database in `<userData>/sats-arena/`. Fake and real
wallets use separate database files so test balances cannot become real sats.
Stop and restart the server after changing its configuration.

**Allow other computers to connect** changes the listen address from
`127.0.0.1` to `0.0.0.0`. Leave this off for local games. Use an independently
hosted, persistent server for normal netplay; don't expose this preview's
unencrypted HTTP API to the public internet. Remote hosting should use HTTPS
or a private network such as Tailscale.

## NWC connection string

Choose **Nostr Wallet Connect** to save/replace/remove a connection string.
For local games, the launcher passes it over a private stdin pipe. The older
server preview receives it as `SATS_ARENA_NWC_URI`. Neither path puts it in
command-line arguments or generated TOML/settings JSON. It is not sent
to a remote server in Connect mode.

The saved string is encrypted using Electron `safeStorage` when an OS
keyring is available. Without a keyring, the UI warns that it is saved
unencrypted in a user-readable-only file (mode 0600 on Unix). Treat the
string as a spending credential and set a wallet-side budget.

**Current limit:** the Rust server accepts NWC configuration but its real
payment adapter is not implemented yet; starting it with `backend = "nwc"`
will fail with an explanatory error. Fake-wallet hosting works. Dolphin
account setup, match reporting, and payments are separate follow-up work.

## Tests

`npm run typecheck` and `npm test` cover the new module. The process tests
spawn a small real HTTP child to check startup/shutdown, concurrent requests,
NWC environment-variable handoff, separate ledgers, occupied ports, and
startup errors. No wallet or real NWC credential is used in tests.
