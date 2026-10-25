# Alby Sandbox development

The launcher home shows the live NWC connection. Sandbox selection, its player
fixtures, server preview settings, and invoice diagnostics live under the
settings gear → **Developer options**. New production profiles default to live
NWC; `make sandbox` and the isolated agent helper explicitly select Sandbox.

The splash page's **Local match settings** persist the playable pot (default
400 sats per human), damage rate (1 sat per 1%), routing surcharge (2%), and
payout delay (5 seconds, configurable from 1–120 seconds). Contributions round
up to whole sats: the default invoice is 408 sats, of which 400 goes into play
and 8 stays in the host wallet for routing fees. This contribution is retained
even on cancellation; it is separate from gameplay winnings and does not promise
to cover every routing fee. Use 0% to disable it. Late/invalid old invoices are
returned in full. Click **Save settings** before opening LOCAL.
The launcher passes all four values to the native host;
development environment overrides remain supported. On reopening an unpaid
lobby, changed terms replace its invoices and retain old hashes for late-payment
returns. A partially or fully funded match keeps its original agreement.

From `/home/deck/projects` or this checkout:

```sh
make sandbox
```

This builds and installs the production launcher, provisions five reusable Alby
test wallets if needed, selects Sandbox, and opens the launcher. Press LOCAL.
The game prefills all four receiving addresses and checks them at PRESS START.
Successful receiving checks are cached by address for 30 minutes, including
across rounds, controller slots, and restarts. Cached receiving limits must still
cover this match's pot. A changed, expired, or incompatible address gets checked
again; each outgoing invoice is independently fetched and validated.
Each human gets a separate BOLT11 entry invoice. **Pay from test wallet** sends
an NWC payment from that player's wallet; Arena's normal incoming-invoice lookup
must confirm payment before admission. Damage batches and settlement use the
same NWC payout path as live mode. No real bitcoin is transferred.

Existing live credentials remain in their protected store. Switching modes
applies to the next game; close an existing game first. Sandbox, live, and the
internal unit-test fake wallet keep separate ledgers. Sandbox receiving addresses
are fixed to the fixture so development cannot accidentally target a real wallet.

Useful commands without rebuilding:

```sh
make sandbox-setup       # Prepare wallets and select Sandbox in the normal launcher
make sandbox-status      # Public receiving addresses only; no connection strings
make sandbox-topup       # Add 10,000 test sats to each existing wallet
make sandbox-check       # NWC create invoice -> pay 1 test sat -> confirmed receipt
```

The fixture is `~/.config/Slippi Launcher/sats-arena/sandbox/wallets.json`
(or under `$XDG_CONFIG_HOME`). It contains the Arena connection followed by P1–P4
connections, is mode 0600, and is reused across runs. Setup resumes partial
provisioning after a network failure. Never delete it as a routine reset: its
wallets correspond to the existing Sandbox receipts. No `.env` setup is needed.
Use `make sandbox-status` to discover addresses instead of hardcoding them.

Sandbox balances and invoices exist within Alby's isolated test system. They
cannot be funded from a normal Lightning wallet or paid to normal external
addresses. See [Alby's testing-wallet documentation](https://raw.githubusercontent.com/getAlby/builder-skill/master/alby-bitcoin-builder/references/testing-wallets.md).

## Agent game testing

```sh
make sandbox-agent
bash slippi-launcher/scripts/sandbox.sh local
python3 slippi-launcher/scripts/sandbox-agent.py --status --wait 30
```

The latter two paths assume the workspace directory; omit `slippi-launcher/`
inside this checkout. Once already built, run `python3 scripts/sandbox-agent.py`
directly to reopen it without rebuilding. The isolated config root is
`~/.local/share/sats-arena/agent`. `session.json` records launch metadata;
`--status` discovers the actual native PID and current ledger path.
The launcher exposes Chromium debugging on loopback port 9338 only in this
explicit agent mode. Its four controllers use FIFOs named `codex1`–`codex4`.

From the workspace, replace PROFILE and PID with `--status` values:

```sh
python3 dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" select --ports 1,2
distrobox enter -n slippi-arena-build --no-tty -- python3 "$PWD/dolphin-controller-mcp/scripts/arena_ui.py" status --pid PID
```

Receiving checks happen automatically after character selection. Wait until both
QR invoices appear, then use `arena_ui.py fund --port 1 --pid PID` and `--port 2`
through the same Distrobox command. In Sandbox, this invokes real NWC test-wallet
payments. It does not manipulate the invoice state. The helper refuses live mode.
`arena_ui.py log --pid PID` reads the payment log through GTK accessibility.

Use `arena_scenarios.py start`, then `battlefield` after admission, then
`pills --port 1 --count 3` to exercise damage. Inspect the actual game and
`SatsArenaSandbox/<wallet fingerprint>/prepaid-match.json` under PROFILE for
confirmed receipts. `walkoff --ports 2 --seconds 25` can exercise settlement;
repeat based on stocks. `no-contest` tests refunds. Four-player and team helpers
are available via `arena_scenarios.py --help`. Input delivery alone does not
prove a hit, receipt, or winner: inspect the resulting state and screenshots.

Read-only accounting audit:

```sh
python3 dolphin-controller-mcp/scripts/audit_arena.py "STATE_FILE"
```

Cleanup closes only the explicitly isolated test game and launcher:

```sh
python3 slippi-launcher/scripts/sandbox-agent.py --close-game
bash slippi-launcher/scripts/sandbox.sh close
```

The standard `make test` covers release helpers. Payment unit/integration tests
are in `src/sats_arena/sandbox.test.ts`, `native_game_process.test.ts`, and the
adjacent `sats-arena` Rust workspace. `make sandbox-check` is opt-in and needs
internet access to the Alby sandbox relay; it transfers one test satoshi.

Local development overrides (apply when opening LOCAL):

- `SATS_ARENA_ENTRY_SATS`: playable pot per human.
- `SATS_ARENA_SATS_PER_PERCENT`: damage rate.
- `SATS_ARENA_SURCHARGE_BPS`: surcharge in basis points (200 = 2%, 0 disables it).
- `SATS_ARENA_BATCH_SECONDS`: whole seconds, 1–120. The first credited hit starts
  the recipient's window; further hits join it without extending it. Match end
  flushes pending damage immediately.

Existing paid agreements preserve all their original terms. Archived ledgers
record the pot, surcharge, and delay; `audit_arena.py` reports playable funds and
retained routing contributions separately.
