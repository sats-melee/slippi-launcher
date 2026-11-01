---
name: sats-arena-live-tests
description: "Run authorized Sats Arena Melee live NWC payment tests across consecutive human/CPU matches, measure real settlement delays, and reconcile failed or unresolved payouts within a sats budget. Use Sandbox for ordinary payment development."
---

# Sats Arena Live Tests

Use actual controller-driven games and live wallet transactions to establish what
players experience. A unit-test pass, queued payout, or send acknowledgement does
not establish payment delivery.

Work in the workspace containing `sats-melee-launcher`, `sats-arena`, `Ishiiruka`,
and `dolphin-controller-mcp`; on this machine it is `/home/deck/projects`.
Read [the live runbook](references/live-runs.md) before operating a wallet.
It describes the existing helpers, their Sandbox-only limits, and the recovery
path. Use the launcher docs and source when those interfaces change.

## Establish the authorized run

- Carry forward the user's current cap, destinations, roster, and other choices.
  Do not ask for permission again for work already authorized. A proposed larger
  allowance does not replenish an exhausted earlier allowance by itself.
- Use a connection supplied for this task. Ask only for missing credentials or
  material scope. Never retrieve the user's saved normal-profile secret for test
  work. A recovery connection must access the wallet that owns the original
  payments; a different funded wallet cannot establish their outcomes.
- Treat the cap as total gross outgoing sats **including fees**, unless the user
  explicitly chooses another definition. Count entry funding and subsequent
  payouts/refunds when both are funded by the run. Do not subtract incoming money
  or count the same transaction twice from its host/receiver observations.
- Plan a finite sequence that fits below the cap, reserving for outstanding
  payouts, retries, and fees before funding another lobby. Verify what the wallet
  actually enforces: its NWC allowance might exclude fees. Never claim a hard cap
  from an estimated fee reserve. If fees cannot be bounded, resolve the spending
  control before starting additional sends.
- Keep the NWC secret out of argv, shell history, screenshots, reports, and logs.
  Use the native private stdin handoff; task-specific credential files, if needed,
  belong in a 0700 private directory with mode 0600. Sanitize provider errors.

## Run a bounded, observable sequence

Write the chosen roster, entry amounts, batching, submission rate, finite match
sequence, and observation deadlines into a public run plan. Reuse the user's
specified addresses, including intentional duplicates. Keep CPU control as real
AI; a human slot driven through the controller helper is still a human slot.

For a four-player request, use two humans/two CPUs unless the user chooses
otherwise. Include consecutive matches without restarting, an observed win,
cancellation/refunds, and a deliberate restart during a genuine outstanding
payout when budget and scope permit. Start with production batching; label a
one-second batching phase as stress testing and record the required restart.
Use small pots sufficient for actual damage payouts. The budget is a ceiling,
not an amount to consume.

For each round, establish fresh invoices, partial-funding admission blocking,
actual CPU damage, confirmed payouts, and the observed match outcome. Continue
through the normal results screen into the next lobby. If testing overlap, prove
that older payouts really were outstanding when the next match played, and that
finished-match accounting stayed frozen. Do not wait for every payout before each
rematch and then claim to have tested overlap.

Capture timing separately for next-lobby readiness, receiving-invoice requests,
dispatch-to-wallet settlement, wallet-settlement-to-app recognition, and genuine
post-match settlement. Mark restart downtime separately. An already-paid pot at
cancellation does not demonstrate loaded final-settlement speed.

Give concise progress updates with actual outcomes and amounts. After a failed
checkpoint, diagnose it instead of repeatedly funding new matches. At the chosen
deadline, mark the scenario failed or blocked; preserve its financial state.
When stopping a funded game, use its normal cancellation/refund path and reserve
for those obligations. Read-only reconciliation may continue within the bounded
observation window without starting another payment test.

## Recover an unresolved settlement

When requested, reconcile the owning ledger before new spending. Inspect original
hashes and exact amounts using that wallet's transaction lookup/history; obtain
receiver receipts when authorized access exists. Operate the original ledger
with one writer. Do not clone unresolved debts into another running profile.

- Confirmed paid: let the owning engine record the receipt; do not send again.
- Definitively failed/rejected or never submitted: retain the debt on **Missed**.
  After its match ends, use **Pay missed payments** for safe amounts. The button
  combines amounts by destination within each match; it excludes unknown sends.
  Preserve `payout_groups`, original failed attempts, and each logical allocation.
  Deduplicate wallet spends/fees by physical payment hash, not receipt row:
  one combined transfer can credit multiple logical payouts.
- Processing, timeout, expired outgoing record, NOT_FOUND, or unverifiable proof:
  retain the debt and original hash. Recheck within the observation deadline;
  none of these alone authorizes a replacement payment.

Check the visible sidebar note and **Match activity** log for amount, destination,
reason, retry, and receipt. Full sidebar text is in the tooltip; **Outbound
payments** gives individual recovery detail. An old local `Failed` label alone
is not wallet proof. Do not clear an unresolved settlement with **Discard unsent
payments**, delete its ledger, manually mark it paid, or edit emulator memory.
If the wallet cannot prove the outcome, report the exact unresolved addresses and
amounts and the evidence still needed. Do not describe unresolved as lost.

## Finish with receipts and accounting

Stop new funding before the cap, reconcile outstanding obligations, and close only
the task's session. Preserve financial state and public evidence. Remove only
temporary credential copies after stopping their users; keep recovery possible
through the user's original connection. Do not change their saved normal wallet.

Report matches completed, actual outcomes, paid sats and fees, remaining owed sats
by address, observed timings, failures, and remaining budget. State whether receipt
proof came from the host alone or also the recipient. Link the evidence under the
launcher's ignored `.release/` directory. Lead with observed results and identify
untested scenarios; do not substitute test counts for live outcomes.
