#!/usr/bin/env python3
"""Verify invoice -> NWC test-wallet payment -> confirmed incoming receipt."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
user = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'Slippi Launcher'
subprocess.run(['bash', str(root / 'slippi-launcher/scripts/sandbox.sh'), 'prepare'], check=True, stdout=subprocess.DEVNULL)
fixture = json.loads((user / 'sats-arena/sandbox/wallets.json').read_text())
rust = root / 'Ishiiruka/build-tools'
subprocess.run(['distrobox', 'enter', '--name', 'slippi-arena-build', '--no-tty', '--', 'env',
    f'CARGO_HOME={rust / "cargo"}', f'RUSTUP_HOME={rust / "rustup"}', 'RUSTUP_TOOLCHAIN=1.88.0',
    str(rust / 'cargo/bin/cargo'), 'build', '--quiet', '--manifest-path', str(root / 'sats-arena/Cargo.toml'),
    '-p', 'sats-arena-core', '--example', 'nwc_sandbox'], check=True)
payload = {'arena_uri': fixture['wallets'][0]['uri'], 'payer_uri': fixture['wallets'][1]['uri']}
subprocess.run(['distrobox', 'enter', '--name', 'slippi-arena-build', '--no-tty', '--',
    str(root / 'sats-arena/target/debug/examples/nwc_sandbox')], input=json.dumps(payload), text=True, check=True)
