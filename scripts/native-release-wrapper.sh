#!/bin/sh
# Generated release entry point. Its payload may live on an AppImage FUSE mount,
# which is not visible inside Distrobox; materialize it in the shared home first.
set -eu

bundle_dir=$(CDPATH= cd -- "$(dirname -- "$0")/native" && pwd -P)
runtime_dir=$(python3 -c '
import errno
import os
from pathlib import Path
import shutil
import sys
import tempfile

source = Path(sys.argv[1])
digest = sys.argv[2]
data_home = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
cache = data_home.expanduser().resolve() / "sats-arena" / "runtime"
cache.mkdir(mode=0o700, parents=True, exist_ok=True)
cache.chmod(0o700)
target = cache / digest

def ready():
    try:
        return (target.is_dir() and not target.is_symlink()
                and (target / ".bundle-sha256").read_text().strip() == digest
                and (target / "dolphin-emu").is_file()
                and (target / "Sys").is_dir()
                and (target / "lib" / "libsats_arena_local.so").is_file()
                and (target / "lib" / "libslippi_rust_extensions.so").is_file())
    except OSError:
        return False

if not ready():
    temporary = Path(tempfile.mkdtemp(prefix="." + digest + "-", dir=cache))
    try:
        shutil.copytree(source, temporary, dirs_exist_ok=True, symlinks=False)
        # copytree preserves source modes; keep the private runtime private.
        for directory, directories, files in os.walk(temporary):
            Path(directory).chmod(0o700)
            for name in files:
                path = Path(directory) / name
                path.chmod(0o700 if path.stat().st_mode & 0o111 else 0o600)
        try:
            temporary.rename(target)
        except OSError as error:
            # Concurrent launchers can finish copying the same bundle first.
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY) or not ready():
                raise
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
if not ready():
    raise SystemExit("Native runtime cache is incomplete: " + str(target))
target.chmod(0o700)
print(target)
' "$bundle_dir" '@NATIVE_BUNDLE_SHA256@')

# Neither the cache helper nor Distrobox reads the private NWC handoff. stdin,
# arguments, and the caller environment continue directly to the game process.
exec distrobox enter --name slippi-arena-build --no-tty -- \
    env GDK_BACKEND=x11 LD_LIBRARY_PATH="$runtime_dir/lib" \
    "$runtime_dir/dolphin-emu" "$@"
