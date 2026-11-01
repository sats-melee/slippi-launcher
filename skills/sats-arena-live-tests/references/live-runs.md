# Live match testing and recovery

## Existing implementation and tools

Read `sats-melee-launcher/docs/native-wallet.md` for the production wallet handoff,
`docs/sandbox.md` for match settings and profile layout, and
`skills/sats-arena-sandbox/references/cpu-games.md` for controller/menu details.
Below, `src/`, `scripts/`, `docs/`, and `skills/` paths are relative to the launcher
checkout. Paths starting with another repository name are relative to the
workspace.

Relevant source:

- `src/sats_arena/native_game_process.ts`: native binary discovery, `-b -e ISO -u
  PROFILE` launch arguments, private one-line JSON stdin handoff, and match settings.
- `sats-arena/local/src/config.rs`: accepted wallet configuration and wallet
  identity; changed connection identity can select a different ledger.
- `sats-arena/local/src/recovery.rs` and `payment_io.rs`: definitive-failure
  history, durable retry scheduling, original-hash reconciliation, timing records.
- `sats-arena/core/src/wallet/nwc.rs`: payment proof validation and interpretation
  of actual NWC replies. Do not infer final failure from an invoice's age.

Existing helpers have real boundaries:

- `scripts/sandbox-agent.py` builds an isolated four-controller profile, provisions
  Sandbox fixtures, and forces Sandbox settings. It is not a live launcher.
- `scripts/payment-game-e2e.py` supports human/CPU and four-player Sandbox scenarios;
  `payment-session-e2e.py` runs consecutive CPU-vs-human Sandbox rounds. Use them as
  maintained examples for observation and accounting, not live payment runners.
- `scripts/sandbox.sh local` sends a LOCAL request to the isolated launcher's
  loopback debug port. The name does not make its target Sandbox; verify the
  actual launcher, native PID, backend, wallet identity, and profile before funding.
- `dolphin-controller-mcp/scripts/arena_scenarios.py` sends controller FIFO inputs.
  This can drive a prepared live profile without changing wallet state.
- `dolphin-controller-mcp/scripts/arena_ui.py status` reads sidebar labels and
  `log` reads native text controls. Open **Match activity** through its actual
  checkbox before reading its separate log window.
- The UI helper's `fund`, `activate`, `capture`, `outbound`, and `close` workflows
  include Sandbox assumptions/guards. Inspect their current source. Do not remove
  a live guard to make a test run. Use supported accessibility/X11 operations for
  the specifically identified live process, and the actual live funding path.
- `audit_arena.py STATE_FILE` is read-only local accounting. The Rust
  `sandbox_receipts` example is Sandbox-specific and requires player credentials;
  neither is proof of a live recipient's receipt.

## Prepare a live session

Use a dedicated profile and task-supplied connection for new games. Reuse existing
controller setup rather than changing the user's normal bindings. Do not copy
Sandbox wallet fixtures into a live session or open a copied unresolved ledger
as another payment writer. Reuse the original owning profile for recovery.

The native credential payload is a JSON line sent through a private stdin pipe:

```json
{"version":1,"backend":"nwc","nwc_uri":"<task-supplied connection>"}
```

Set `SATS_ARENA_WALLET_CONFIG=stdin` for the native process. Prefer the production
launch path. If a task-specific launcher is needed, match the native process
source and send JSON through a subprocess pipe; do not embed a real connection
in a shell command or committed script. Never dump the process environment.
The Sandbox agent removes `SATS_ARENA_*` overrides, so it cannot be repurposed
simply by exporting a live connection beforehand.

Read-only preflight should establish the expected network, wallet identity,
balance/allowance, and permissions needed for invoice creation, payments, lookups,
and transaction-history reconciliation. Verify any per-payment fee policy and
whether allowance includes fees. Check receiving-address limits against the pot.
Do not create a paid preflight merely to check credentials.

Build/install before funding. Verify the actual running native build, for example
by comparing its loaded `libsats_arena_local.so` SHA-256 from `/proc/PID/maps`
against the installed/built library. A successful release command does not prove
an already-running process updated. Capture only sanitized build identity.

Live state is under `PROFILE/SatsArenaLive/<wallet fingerprint>/prepaid-match.json`.
Finished matches can be in `pending_matches` or `matches/<match-id>.json`. Record
the immutable match IDs and public starting state before the first payment.

An explicitly requested recovery with a replacement connection can set
`SATS_ARENA_RECOVER_WALLET_ID` to the original ledger's 64-character fingerprint
while using its original profile. The engine requires the new connection to
prove an original settled payment before recovery starts, preserves the original
ledger binding, and uses its existing exclusive lock. Do not rewrite the identity
in JSON or copy debts to a new fingerprint directory. Sandbox rejects this
override. Read the implementation before using an older installed build.

## Plan and budget

Store a public plan with the cap in millisatoshis, gross spend so far, pending
spend reservations, fee control, roster and addresses, entry terms, and the finite
match sequence. Keep all payment components in millisatoshis until presentation.
The invariant before another send is:

```text
confirmed gross outgoing amounts and fees
+ reserved maximum cost of uncertain sends and funded obligations
+ maximum additional cost authorized by this step
<= total authorized cap
```

Use actual wallet fees, not a rounded estimate. Reserve an uncertain submission's
principal until its original outcome is known. Reserve future payout/refund costs
when funding the lobby, not only when the payout is dispatched. Include bounded
retry fees. Deduplicate transaction evidence by wallet identity and payment hash;
an outgoing payment and its recipient's incoming receipt describe one transfer.

For scale, four 200-sat playable entries at a 2% surcharge cost 816 sats in entry
funding and create up to 800 sats of payouts/refunds: 1,616 gross sats per completed
round before routing fees. Eight such rounds total 12,928 sats before fees and
existing recovery obligations. This is an example for planning a 20,000-sat cap,
not authorization, a required round count, or a sufficient fee bound.

Use a wallet-enforced total limit including fees or a verified enforceable fee
policy with reservations for every possible authorized payment. An NWC allowance
that ignores fees is not an all-in spending guarantee. If the current app's
wallet-managed-fee mode cannot honor the cap with the supplied wallet, stop before
new funding and explain that specific limitation.

## Controller sequence and checkpoints

For the two-human/two-CPU case, configure CPU wallets before opening LOCAL. Select
all four ports and then make P3/P4 CPUs, verifying kinds `[0,0,1,1]` in the ledger
and actual AI control on screen. The existing controller helper supports:

```sh
python3 ../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" select --ports 1,2,3,4
python3 ../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" cpu --ports 3,4
python3 ../dolphin-controller-mcp/scripts/arena_scenarios.py --user-dir "PROFILE" start --port 1
```

Use an actual absolute profile path in place of PROFILE. Restore render focus
after using sidebar controls. Wait for normal FPS; do not build during timed
menu inputs. Verify the selected scene/roster rather than blindly repeating input.

For an all-CPU stress request, use `cpu --ports 1,2,3,4` after selecting all four
fighters, and require ledger kinds `[1,1,1,1]`, four entry receipts, and actual
autonomous damage. Skip human `pills`/`walkoff` actions for those slots. Start and
the normal pause/No Contest sequence were verified from controller P1 with an
all-CPU roster.

Keep normal four-stock rules unless the user chooses a shorter game. Reduce the
buy-in to conserve the authorized budget; do not shorten gameplay without asking.
Check the actual stock/time rules before choosing a winner deadline. The imported
profile uses four stocks and an eight-minute timer; a low-level CPU duel can
outlast a four-minute observer deadline. For short repeat tests, a one-stock
variant can be configured through Custom Rules before funding and must be
reported as such. The verified rule-menu route is the opening part of
`cpu_from_selected`: P1 up 1000 ms, down 25 ms, right 400 ms, A. On the default
Stock menu, down 100 ms then three separate left 70 ms movements (with 200 ms
neutral between them) changes stock 4 to 1; B returns. Inspect the number first
and capture the result. Rules reverted to four stocks after restarting the
native game, so do not assume that setting persists.

The `battlefield` helper sends a relative cursor movement. A four-player run
selected Corneria from its saved cursor position. Inspect and report the actual
stage rather than inferring it from the helper's name.

Bind each funding intent to the current match ID, participant, exact invoice
amount, and fresh hash. Persist submission intent before a direct test-wallet
send. A timeout goes to original-hash lookup, never a blind resend. Verify a
confirmed incoming entry, and that one paid slot does not admit all four players.
Do not use the Sandbox **Test pay** helper for a live invoice.

Start the actual game and use `battlefield`, human `pills`, or other documented
controller actions. Observe damage credits and at least one confirmed payout.
Use `no-contest` for refunds, or control the human fighters to produce an observed
winner. Verify stocks/outcome; an issued walkoff is not a proven match finish.
Return through results with normal Start input, verify fresh invoices and unpaid
admission, then fund the next planned round only if the budget permits it.

Observe the next lobby independently of old settlement. For an overlap scenario,
record old in-flight hashes while the new match actually plays and check that the
old match gains no further damage credits. If there is no backlog, report that
the overlap condition was not exercised. A restart scenario must resume the same
ledger and original hashes, with just one payment writer.

After restart, the native PID can exist before its GTK accessibility tree.
Treat that temporary absence as startup within the bounded readiness wait.
An observer failure does not authorize another funded match: reattach to the
existing match and preserve the failed checkpoint separately from its eventual
game outcome or late receipt.

## Receipt proof, timing, and visible failures

Use the existing NWC adapter or an inspected read-only diagnostic. Read connection
material privately and return only allowlisted fields: hash, direction, state,
amount, fees, and timestamps. Prior development tools may exist under
`.release/live-duress-20261028/wallet-tool/` and `sats-arena/target/debug/live-wallet-tool`;
they are untracked local artifacts, not required installed interfaces. Inspect
their source and permissions if reusing them. Do not treat their presence as an
authorization to pay.

For third-party addresses, host lookup with validated payment proof may be the
available delivery evidence. Say so; do not invent receiver access or claim
independent recipient verification without it. Missing or paginated history
requires exact-hash lookup before concluding anything about a payment.
For a large audit, collect bounded, paginated outgoing history once and match
each expected hash, amount and state. Query missing or ambiguous original hashes
individually. Alby may cap pages at 50 even when a larger limit is requested;
its optional `unpaid_outgoing` flag includes unpaid outgoing records. Do heavy
receipt audits after the measured gameplay so audit traffic does not compete
with the app. Preserve a failed latency checkpoint even if settlement later
completes. An incoming pending record is not proof an outgoing payment failed.

`payment-timings.jsonl` identifies operation stage, attempt, and elapsed time.
Check duplicate dispatches by obligation ID **and attempt**, then confirm each
fresh attempt follows a definitive prior failure. Use original hashes to detect
actual duplicate sends; two attempts are not automatically duplicates.
Record wallet timestamp precision when comparing its settlement time to the
app's observation clock. Include the actual batching and submission-rate settings.

Capture the sidebar's address/amount/reason note, full tooltip or Match activity
text, and per-address outstanding totals. Compare final ledgers to wallet
transactions, not just their local Paid labels. If an unknown payment remains,
the test cannot be reported as fully settled.

Keep one evidence directory per session under `.release/`. A compact final report
should include each round's outcome, timing, paid amounts/fees, unresolved amounts
by address, budget remaining, and why any scenario stopped. A failed provider
operation is a useful result; opening repeated funded games until one passes is
not a sound recovery strategy.
