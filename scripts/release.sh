#!/usr/bin/env bash
# Build/install this machine's release. Wallet configuration stays in the launcher.
set -euo pipefail
LAUNCHER_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$(dirname "$LAUNCHER_ROOT")"
if [[ -f /.flatpak-info || -n "${FLATPAK_ID:-}" ]]; then
  exec flatpak-spawn --host /bin/bash "$LAUNCHER_ROOT/scripts/release.sh" "$@"
fi

launch=false
case "${1:-}" in
  --launch) launch=true; shift ;;
  --dev) mode=dev; shift ;;
  "") ;;
  *) echo 'Usage: release.sh [--launch | --dev] [-- launcher arguments]' >&2; exit 2 ;;
esac
if [[ "${1:-}" == -- ]]; then shift; fi
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'This release setup currently supports Linux x86_64.' >&2
  exit 1
fi
mkdir -p "$LAUNCHER_ROOT/.release"
cd "$LAUNCHER_ROOT"

phase() {
  local label="$1" logfile="$2"
  shift 2
  echo "$label"
  if ! "$@" >"$LAUNCHER_ROOT/.release/$logfile" 2>&1; then
    tail -n 65 "$LAUNCHER_ROOT/.release/$logfile" >&2
    echo "Failed. Full log: $LAUNCHER_ROOT/.release/$logfile" >&2
    exit 1
  fi
}

# Prefer an explicitly selected or already installed supported Node.
if [[ -n "${NODE_BIN:-}" ]]; then export PATH="$NODE_BIN:$PATH"; fi
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] < 20 ? 1 : 0)'; then
  for candidate in "$HOME"/.local/opt/node-v*-linux-x64/bin; do
    if [[ -x "$candidate/node" ]] && "$candidate/node" -e 'process.exit(+process.versions.node.split(".")[0] < 20 ? 1 : 0)'; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] < 20 ? 1 : 0)'; then
  # Pinned user-local toolchain; never alters the host package manager.
  node_version=v22.23.4
  archive="node-$node_version-linux-x64.tar.xz"
  scratch=$(mktemp -d)
  trap 'python3 -c '\''import shutil,sys; shutil.rmtree(sys.argv[1])'\'' "$scratch"' EXIT
  echo "Installing Node $node_version in $HOME/.local/opt ..."
  curl --fail --location --silent --show-error "https://nodejs.org/dist/$node_version/$archive" -o "$scratch/$archive"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/$node_version/SHASUMS256.txt" -o "$scratch/SHASUMS256.txt"
  (cd "$scratch"; python3 - "$archive" <<'PY'
import hashlib
from pathlib import Path
import sys
archive = Path(sys.argv[1])
expected = dict(line.split()[::-1] for line in Path('SHASUMS256.txt').read_text().splitlines())[archive.name]
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Node download checksum mismatch')
PY
  )
  mkdir -p "$HOME/.local/opt"
  tar -xJf "$scratch/$archive" -C "$HOME/.local/opt"
  export PATH="$HOME/.local/opt/node-$node_version-linux-x64/bin:$PATH"
fi
if [[ "${mode:-}" == dev ]]; then
  if ! npm ls --depth=0 >.release/dependencies.log 2>&1; then
    phase 'Installing launcher dependencies ...' dependencies.log npm ci
  fi
  exec npm run dev -- "$@"
fi

for dependency in python3 distrobox; do
  if ! command -v "$dependency" >/dev/null; then
    echo "Missing host prerequisite: $dependency" >&2; exit 1
  fi
done
for checkout in Ishiiruka sats-arena slippi-ssbm-asm; do
  if [[ ! -d "$WORKSPACE/$checkout" ]]; then
    echo "Missing adjacent checkout: $WORKSPACE/$checkout" >&2; exit 1
  fi
done
containers=$(distrobox list --no-color)
if [[ "$containers" != *slippi-arena-build* ]]; then
  phase 'Preparing the native build container ...' container.log bash "$WORKSPACE/Ishiiruka/Tools/arena/setup.sh"
fi
# npm's Electron native extensions also need the container's C/C++ toolchain.
node_dir=$(dirname "$(command -v node)")
container_npm() {
  distrobox enter --name slippi-arena-build --no-tty -- env PATH="$node_dir:$PATH" npm "$@"
}
if ! npm ls --depth=0 >.release/dependencies.log 2>&1; then
  phase 'Installing launcher dependencies ...' dependencies.log container_npm ci
fi
iso=$(python3 scripts/release-install.py --find-iso --workspace "$WORKSPACE")
if [[ -n "$iso" ]]; then
  if [[ ! -x "$WORKSPACE/slippi-ssbm-asm/build-tools/bin/gecko" ]]; then
    phase 'Installing the assembly tools ...' assembly-tools.log distrobox enter --name slippi-arena-build --no-tty -- bash "$WORKSPACE/slippi-ssbm-asm/setup-arena-tools.sh"
  fi
  phase 'Building and validating the Melee hooks ...' assembly.log bash "$WORKSPACE/Ishiiruka/Tools/arena/build-codeset.sh" "$iso"
fi
phase 'Building the native game and payment panel (Release) ...' native.log bash "$WORKSPACE/Ishiiruka/Tools/arena/build.sh"
phase 'Bundling the native game ...' stage.log python3 scripts/stage-native.py --native-root "$WORKSPACE/Ishiiruka"
phase 'Packaging the production launcher ...' package.log container_npm run package -- --linux AppImage --x64
version=$(node -p 'require("./release/app/package.json").version')
python3 scripts/release-install.py --workspace "$WORKSPACE" --appimage "$LAUNCHER_ROOT/release/build/Slippi-Launcher-$version-x86_64.AppImage"
if "$launch"; then
  echo 'Opening Sats Arena launcher ...'
  exec "$HOME/.local/bin/sats-arena" "$@"
fi
