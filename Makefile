SHELL := /bin/bash
.DEFAULT_GOAL := app
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
ARGS ?=
export NODE_BIN

.PHONY: app launcher arena release dev build test help sandbox sandbox-setup sandbox-status sandbox-agent sandbox-check sandbox-topup
sandbox-topup:
	@bash "$(ROOT)scripts/sandbox.sh" topup
sandbox-agent: release
	@python3 "$(ROOT)scripts/sandbox-agent.py" $(ARGS)
sandbox-check:
	@python3 "$(ROOT)scripts/sandbox-check.py"
sandbox: release
	@bash "$(ROOT)scripts/sandbox.sh" setup
	@env -u SATS_ARENA_NWC_URI -u SATS_ARENA_WALLET_BACKEND "$(HOME)/.local/bin/sats-arena" $(ARGS)
sandbox-setup:
	@bash "$(ROOT)scripts/sandbox.sh" setup
sandbox-status:
	@bash "$(ROOT)scripts/sandbox.sh" status
app launcher arena:
	@bash "$(ROOT)scripts/release.sh" --launch -- $(ARGS)
release build:
	@bash "$(ROOT)scripts/release.sh"
dev:
	@bash "$(ROOT)scripts/release.sh" --dev -- $(ARGS)
test:
	@python3 -m unittest discover -s "$(ROOT)scripts" -p 'test_*.py'
	@bash -n "$(ROOT)scripts/release.sh" "$(ROOT)scripts/native-release-wrapper.sh"
help:
	@printf '%s\n' 'make app      Build, install, and open the production launcher (default)' 'make release  Build and install without opening' 'make sandbox  Build, prepare Alby test wallets, and open the launcher' 'make sandbox-agent  Build and open an isolated agent profile with four pipe controllers' 'make sandbox-check  Verify an NWC sandbox payment round trip' 'make dev      Run the development launcher' 'make test     Test release installation and native bundling'
