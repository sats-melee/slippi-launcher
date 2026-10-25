#!/usr/bin/env python3
"""Stage the native Sats Arena runtime for an Electron release package."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = SCRIPT_DIR.parent / "assets" / "include" / "sats-arena"
HASH_PLACEHOLDER = "@NATIVE_BUNDLE_SHA256@"


def bundle_hash(root: Path) -> str:
    """Hash the materialized payload, including paths and executable bits."""
    digest = hashlib.sha256(b"sats-arena-native-v1\0")
    for entry in sorted(root.rglob("*"), key=lambda path: path.relative_to(root).as_posix()):
        relative = entry.relative_to(root).as_posix().encode("utf-8")
        digest.update((b"D" if entry.is_dir() else b"F") + relative + b"\0")
        if entry.is_file():
            digest.update(str(entry.stat().st_size).encode("ascii") + b"\0")
            digest.update(b"X" if entry.stat().st_mode & 0o111 else b"-")
            with entry.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
    return digest.hexdigest()


def stage(native_root: Path, output: Path) -> dict:
    native_root = native_root.expanduser().resolve(strict=True)
    output = output.expanduser().absolute()
    build = native_root / "build-arena"
    sources = {
        "dolphin-emu": build / "Binaries" / "dolphin-emu",
        "Sys": build / "Binaries" / "Sys",
        "lib/libsats_arena_local.so": build / "Source" / "Core" / "DolphinWX" / "libsats_arena_local.so",
        "lib/libslippi_rust_extensions.so": build / "Source" / "Core" / "DolphinWX" / "libslippi_rust_extensions.so",
    }
    # Resolve build symlinks now; no build paths or symlinks enter the release.
    sources = {name: path.resolve(strict=True) for name, path in sources.items()}
    for name, path in sources.items():
        if not (path.is_dir() if name == "Sys" else path.is_file()):
            raise ValueError(f"Invalid native build resource: {path}")
    template = (SCRIPT_DIR / "native-release-wrapper.sh").read_text()
    if template.count(HASH_PLACEHOLDER) != 1:
        raise ValueError("The native wrapper must contain exactly one bundle hash placeholder")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".sats-arena-stage-", dir=output.parent) as scratch:
        scratch = Path(scratch)
        payload = scratch / "native"
        (payload / "lib").mkdir(parents=True)
        for name, source in sources.items():
            destination = payload / name
            if name == "Sys":
                shutil.copytree(source, destination, symlinks=False)
            else:
                shutil.copy2(source, destination)
        (payload / "dolphin-emu").chmod(0o755)
        digest = bundle_hash(payload)
        (payload / ".bundle-sha256").write_text(digest + "\n")
        wrapper = scratch / "dolphin-emu"
        wrapper.write_text(template.replace(HASH_PLACEHOLDER, digest))
        wrapper.chmod(0o755)

        # Only these generated resources belong to this script; preserve any
        # other files a caller may have in the selected output directory.
        output.mkdir(parents=True, exist_ok=True)
        old_payload = output / "native"
        backup = scratch / "previous-native"
        if old_payload.exists() or old_payload.is_symlink():
            old_payload.rename(backup)
        try:
            payload.rename(old_payload)
            os.replace(wrapper, output / "dolphin-emu")
        except BaseException:
            if old_payload.exists():
                shutil.rmtree(old_payload)
            if backup.exists() or backup.is_symlink():
                backup.rename(old_payload)
            raise
    return {"output": str(output), "sha256": digest}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-root", required=True, type=Path, help="Ishiiruka checkout containing build-arena")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Generated release resource directory")
    args = parser.parse_args()
    try:
        result = stage(args.native_root, args.output)
    except (OSError, ValueError, shutil.Error) as error:
        parser.exit(1, f"Native staging failed: {error}\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
