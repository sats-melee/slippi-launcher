# Sats Arena development

Use the Alby **Sandbox** for payment integration work. Start with
[docs/sandbox.md](docs/sandbox.md), which lists reproducible launch, controller,
funding, and cleanup commands. `make sandbox-agent` builds and opens an isolated
launcher with four controller pipes; its player receiving addresses are prefilled.
The reusable `$sats-arena-sandbox` skill is tracked in
`skills/sats-arena-sandbox/SKILL.md` and installed in this user's Codex skills.
For explicitly authorized live match tests or settlement recovery, use
[`sats-arena-live-tests`](skills/sats-arena-live-tests/SKILL.md), with a
task-supplied connection, the user's current spending cap, and original-hash
reconciliation. Live testing is not implied by a Sandbox development task.

The user's saved live NWC connection is outside the repository. Do not inspect,
print, copy, replace, or use it for development. Sandbox fixtures have their own
private file and Sandbox ledgers. Do not commit fixture connection strings.

Keep the deterministic fake wallet for unit tests. User-facing Sandbox tests
must create BOLT11 invoices, send NWC payments, and observe confirmed receipts;
never mark an invoice paid by changing local state. Use controller input for
gameplay. Do not edit emulated memory or financial ledgers to make tests pass.
