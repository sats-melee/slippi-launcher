---
name: sats-arena-sandbox
description: "Set up and test Sats Arena Melee payments with Alby Sandbox wallets and actual controller-driven games, including solo CPU-wallet setup, funding, damage payouts, settlement, and payment debugging."
---

# Sats Arena Sandbox

Use the same NWC invoice and payout path as live Arena, with isolated Alby test
wallets. The deterministic fake wallet is for unit tests; it does not establish
that payment integration works.

Locate the workspace containing `sats-melee-launcher`, `Ishiiruka`, `sats-arena`,
`slippi-ssbm-asm`, and `dolphin-controller-mcp`. On this machine it is
`/home/deck/projects` (older checkouts call the launcher `slippi-launcher`).
Read the launcher's `docs/sandbox.md` for maintained
commands and paths; use existing helpers instead of rebuilding wallet or
controller plumbing in temporary scripts.

## Choose the requested operation

- Solo CPU setup or CPU payment testing: read
  [CPU games](references/cpu-games.md) for the verified menu, funding, focus,
  debugging, and recovery steps. Reuse the existing helpers.
- Inspect only: read source, `make sandbox-status`, and existing test evidence.
  Do not start a game or create wallets for an explanation-only request.
- Human development: `make sandbox` builds, provisions missing test wallets,
  selects Sandbox in the normal launcher, and opens it. LOCAL starts the game.
- Agent gameplay: `make sandbox-agent` builds and opens an isolated launcher
  with four pipe controllers. If already built, run
  `python3 scripts/sandbox-agent.py` from the launcher checkout.
- Wallet-only integration: `make sandbox-check` creates an invoice, sends one
  test satoshi through NWC, and confirms the incoming receipt.

Provisioning and sandbox payments are appropriate when the user's task includes
setup or payment testing. They are not authorization to spend from a live wallet.

## Drive the isolated game

From the launcher checkout after starting the agent launcher:

```sh
bash scripts/sandbox.sh local
python3 scripts/sandbox-agent.py --status --wait 30
```

Use the returned native PID and profile path; never assume an old PID still
identifies the current game. It uses persistent fixtures under
`~/.local/share/sats-arena/agent`, rather than the normal user's controller
configuration. The explicit agent launcher exposes loopback Chromium debugging
on port 9338. Its controllers are `Pipe/0/codex1` through `codex4`.

Use `../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE"`
for actual controller input: `select --ports 1,2`, `start`, `battlefield`,
`pills`, `walkoff`, and the documented team/CPU variants. Select characters
before expecting entry invoices. All four sandbox receiving addresses are
prefilled; verification happens automatically at PRESS START.

Use GTK accessibility through the build container for sidebar controls:

```sh
distrobox enter -n slippi-arena-build --no-tty -- python3 \
  "$PWD/../dolphin-controller-mcp/scripts/arena_ui.py" status --pid PID
```

The same helper accepts `fund --port N --pid PID` and `log --pid PID`.
In Sandbox, **Pay from test wallet** sends an NWC payment from the corresponding
player wallet and waits for Arena's confirmed incoming receipt. Fund each
participating player separately. By default CPUs have no wallet. Enable
**CPU wallets** in Developer options before LOCAL to test real CPU entries,
damage payouts, winnings and refunds; each CPU uses its port's Sandbox wallet.

## Establish observable success

For changes affecting payments or admission, exercise the relevant parts of:

1. Prefilled sandbox addresses verify, and each financial participant gets its own BOLT11 QR.
2. One paid entry leaves the match blocked; all required receipts allow Start.
3. Actual in-game damage produces a confirmed payout after the batch window.
4. The observed winner or winning team receives the correct settlement;
   cancellation returns unspent entries. CPUs receive payments only when the
   developer CPU-wallet option was enabled before funding.

Inspect the game, the sidebar's payment log, and the Sandbox ledger path from
`--status`. Controller delivery alone does not prove selection, a hit, or a
winner. An NWC send acknowledgement alone does not prove incoming admission.
Use `../dolphin-controller-mcp/scripts/audit_arena.py "STATE_FILE"` for a read-only
accounting check. Capture relevant receipts before the next-match loop resets
the current pot. Keep evidence under the launcher's ignored `.release/` folder.

For implementation checks, use the focused launcher tests documented in
`docs/sandbox.md`, Rust core/local tests in `sats-arena`, and
`Ishiiruka/Tools/arena/test.sh` for native admission/tracking changes.

## Operational invariants

- Never inspect, print, copy, replace, or use the saved live NWC credential for
  sandbox work. The separate sandbox fixture contains its own test credentials;
  status commands return public addresses only. Do not commit connection strings.
- Discover addresses with `make sandbox-status`; do not hardcode this run's
  generated addresses. Setup reuses five wallets and resumes partial creation.
  `make sandbox-topup` adds test balance without rotating wallet identities.
- Sandbox wallets only pay within their isolated system. Do not fund their QR
  invoices with a normal wallet or substitute real Lightning addresses.
- Never mark invoices paid or edit financial ledgers/emulated memory to make a
  test pass. Preserve existing fixture and ledger files during recovery.
- Wallet mode is fixed when a game starts. Close an existing game before
  changing mode; the launcher selection does not reconfigure a running child.
- Payment requests run off the emulation thread. Admission must still require
  fresh game authorization. Temporary polling/readiness gaps must not cancel a
  funded, unchanged lobby; actual roster, team, character, or scene changes must
  invalidate the old lobby. The native gate has separate generations for these.
- If the faucet or relay is unavailable, or capability checks fail, report that
  limitation and preserve state. Do not silently fall back to fake payments.

Cleanup only the isolated test session:

```sh
python3 scripts/sandbox-agent.py --close-game
bash scripts/sandbox.sh close
```

Report the observed receipts/results and any untested scenario. Do not describe
sandbox balances as real bitcoin or claim that sandbox success tested mainnet.
