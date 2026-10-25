SHELL := /bin/bash
.DEFAULT_GOAL := app
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
ARGS ?=
export NODE_BIN

.PHONY: app launcher arena release dev build test help
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
	@printf '%s\n' 'make app      Build, install, and open the production launcher (default)' 'make release  Build and install without opening' 'make dev      Run the development launcher' 'make test     Test release installation and native bundling'
