#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f /.flatpak-info || -n "${FLATPAK_ID:-}" ]]; then
  exec flatpak-spawn --host /bin/bash "$root/scripts/sandbox.sh" "$@"
fi
if ! command -v node >/dev/null; then
  for candidate in "$HOME"/.local/opt/node-v*-linux-x64/bin; do
    if [[ -x "$candidate/node" ]]; then export PATH="$candidate:$PATH"; break; fi
  done
fi
cd "$root"
case "${1:-}" in
  local|screenshot|close) exec node scripts/sandbox-control.mjs "$@" ;;
esac
export TS_NODE_TRANSPILE_ONLY=true
exec node -r ts-node/register scripts/sandbox.ts "$@"
