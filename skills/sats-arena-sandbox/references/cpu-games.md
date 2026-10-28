# Solo games with CPU wallets

Work from the launcher checkout, `/home/deck/projects/sats-melee-launcher` on this
machine. The controller helpers live in `../dolphin-controller-mcp/scripts`.
Use Alby Sandbox for payment development; CPU control must remain real AI.

## Automated game

The existing runner builds and installs the app, enables CPU wallets through the
actual launcher UI, selects characters through controller FIFOs, funds entries
through the native sidebar, and queries the receiving wallets independently:

```sh
python3 scripts/payment-game-e2e.py --scenario cpu --finish cancel --play-seconds 20
```

Once built, useful variants are:

```sh
python3 scripts/payment-game-e2e.py --no-build --scenario cpu
python3 scripts/payment-game-e2e.py --no-build --scenario cpu-four --finish cancel
python3 scripts/payment-game-e2e.py --no-build --scenario cpu --restart-during-payout
```

`cpu` is CPU P1 versus human P2; `cpu-four` adds CPU P3 and P4. The default finish
is a CPU victory; `--finish cancel` tests refunds. The runner uses an isolated
persistent profile and chooses a free loopback debugging port. Use `--root` to
select another isolated profile. Keep fixtures and ledgers between runs.
Evidence and the actual pass/fail result are in `.release/payment-e2e/`.
A failed payment or missed gameplay checkpoint is not an E2E pass.
The default damage batch window is five seconds, matching production. Add
`--batch-seconds 1` deliberately for a higher-pressure queue test and report that
setting with its results; do not present it as the default configuration.
The settlement deadline defaults to 60 seconds; `--settlement-deadline` changes
the test bound, not the payment engine. Always report the measured delay too.
To check admission while genuine earlier payouts remain unconfirmed, reuse that
isolated `--root` and add `--require-background-payments`. The runner requires
older in-flight payments during actual gameplay, preserves their identities,
and checks the separate native note saying a new match can be played.

## Human setup

Open launcher **Developer options**, choose **Sandbox — Alby test wallets**, and
prepare/reuse the test wallets. In **Payment debugging**, enable **CPU wallets**.
Start with **Payment starts per second = 1**. A one-second damage payout delay
is useful for creating a test backlog; save changed match settings before LOCAL.

Open LOCAL, select a human character and one or more actual CPU opponents, then
press Start. Every financial player, including each CPU, needs a verified
receiving address and its own entry payment. Use **Pay from test wallet** on each
participating card. Confirm all entries before starting the match. CPU wallets
are off by default and changes apply on the next LOCAL launch; funded agreements
retain their original terms.

## Agent menu and funding sequence

Launch the existing isolated helper instead of changing the normal controller
profile. For example, with an unused debugging port:

```sh
export ARENA_AGENT_DEBUG_PORT=9338
python3 scripts/sandbox-agent.py --cpu-wallets --batch-seconds 1 --port "$ARENA_AGENT_DEBUG_PORT"
bash scripts/sandbox.sh local
python3 scripts/sandbox-agent.py --status --wait 30
```

Use the returned PID and PROFILE below. The GTK helper waits for the Sandbox
window; `activate` focuses the actual render area after interacting with sidebar
controls. Let startup reach normal speed before timed controller sequences.
Do not compile in parallel with these menu inputs: reduced FPS changes where a
wall-clock movement lands.

```sh
distrobox enter -n slippi-arena-build --no-tty -- env GDK_BACKEND=x11 python3 \
  "$PWD/../dolphin-controller-mcp/scripts/arena_ui.py" activate --pid PID
python3 ../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" select --ports 1,2
python3 ../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" cpu --ports 1
python3 ../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" start --port 2
```

For four players, select `1,2,3,4`, then use `cpu --ports 1,3,4`. The `cpu`
helper opens/closes Custom Rules to return the hands to their kind selectors,
then cycles only those slots to CPU. Avoid the older `cpu-p1` route unless its
documented starting cursor position is actually present.

Before paying, inspect the game and persisted roster: CPU wallets must be true,
with kinds `[1,0,3,3]` or `[1,0,1,1]` (human 0, CPU 1, closed 3), and a separate
entry invoice for each participant. Controller delivery alone proves none of this.

Fund each port through the real GTK button, using the same Distrobox prefix:

```sh
distrobox enter -n slippi-arena-build --no-tty -- python3 \
  "$PWD/../dolphin-controller-mcp/scripts/arena_ui.py" fund --port 1 --pid PID
```

One paid entry must leave admission blocked. Repeat for P2 and any P3/P4 CPUs.
Reactivate the render area, request Start on human P2, then use
`arena_scenarios.py --user-dir "PROFILE" battlefield --port 2` after admission.
Observe real CPU damage and confirmed payouts, not just elapsed time or queued
intents. Before ending gameplay, reactivate again. Use `no-contest --port 2`
for cancellation; `walkoff --ports 2 --direction right --seconds 25` can produce
a CPU victory. Inspect remaining stocks and repeat as needed; never steer a CPU
through emulator memory.

## Debugging and evidence

`arena_ui.py outbound --pid PID` checks **Show outbound payments** and reads the
actual native debug text; `--show off` verifies collapse. It includes current,
recovering, and archived payouts, including consolidated originals. Use
`arena_ui.py capture --pid PID --output /absolute/path.png` with
`GDK_BACKEND=x11` for a screenshot of that exact Sandbox window.
Check the control's real dimensions and screenshot too: GTK accessibility can
expose text from a clipped or 1x1 widget that a person cannot use.

Match state lives under `PROFILE/SatsArenaSandbox/<fingerprint>/`. After a game,
its immutable ID may be in `pending_matches` or `matches/<id>.json` rather than
the new current lobby. `audit_arena.py` checks accounting only. The runner's
read-only Rust `sandbox_receipts` example checks actual host entry receipts,
outgoing payment status, and each receiving wallet's exact incoming amount.
Provide its Sandbox fixture/state paths on stdin; never print connection strings.

- No CPU QR: first verify the option, roster, address check, and running build.
  The invoice callback must accept `pot.participates(player)`, not only human
  kind 0. A stale build can repeatedly retire CPU invoices without displaying one.
- Wrong menu selection or no quit: capture the game, restore render focus, and
  verify FPS before retrying controller inputs. Input success is not game success.
- Launcher restart rejected as still open: the container wrapper can outlive the
  native PID briefly. Retry the guarded LOCAL action for up to 30 seconds and
  rediscover the new PID; do not assume a successful button click launched a game.
- Debug port cannot bind after a rapid restart: choose another unused port and
  pass the same value to the helper and `ARENA_AGENT_DEBUG_PORT`. The E2E runner
  chooses a fresh port automatically.
- NWC/receiving-provider failures: retain original in-flight IDs and invoices,
  preserve the ledger, and report pending/failed amounts and provider timings.
  Bound retries and inspect the cause; do not rotate wallets, rewrite receipts,
  or repeatedly start funded games to hide an unresolved payment.

Close only this isolated game with `sandbox-agent.py --close-game` and its
launcher with `sandbox.sh close`, using the same root/port. Keep evidence and
fixture identities for later recovery. Sandbox receipts do not establish mainnet
behavior.
