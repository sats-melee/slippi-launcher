#!/usr/bin/env python3
"""Install a built Sats Arena release and reuse this user's existing game setup.

No wallet credentials are read or changed. --home provides an isolated home for
tests; otherwise the usual HOME and XDG directory settings are respected.
"""

import argparse
import configparser
import json
import os
from pathlib import Path
import shlex
import shutil
import sys
import tempfile


class Layout:
    def __init__(self, home=None, install_root=None, environ=None):
        env = os.environ if environ is None else environ
        self.home = Path(home or env.get("HOME", str(Path.home()))).expanduser().resolve()
        # An explicit --home must never pick up the real user's XDG directories.
        self.config = Path(env.get("XDG_CONFIG_HOME", self.home / ".config")) if home is None else self.home / ".config"
        self.data = Path(env.get("XDG_DATA_HOME", self.home / ".local/share")) if home is None else self.home / ".local/share"
        self.install = Path(install_root).expanduser().resolve() if install_root else self.home / ".local/opt/sats-arena"
        self.command = self.home / ".local/bin/sats-arena"
        self.appimage = self.install / "SatsArena.AppImage"
        self.user_data = self.config / "Slippi Launcher"
        self.settings = self.user_data / "Settings"


def read_settings(path):
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError("Launcher Settings could not be read; leaving it unchanged.") from error
    if not isinstance(value, dict) or not isinstance(value.get("settings", {}), dict):
        raise ValueError("Launcher Settings has an unexpected format; leaving it unchanged.")
    return value


def valid_iso(path):
    if not isinstance(path, (str, Path)) or not str(path).strip():
        return False
    try:
        with Path(path).expanduser().open("rb") as handle:
            header = handle.read(8)
        return len(header) == 8 and header[:6] == b"GALE01" and header[7] == 2
    except (OSError, ValueError):
        return False


def find_iso(layout, workspace, settings):
    """Return only a validated NTSC-U Melee 1.02 disc, without scanning home."""
    existing = settings.get("settings", {}).get("isoPath")
    if valid_iso(existing):
        return Path(existing).expanduser().resolve()
    workspace = Path(workspace).expanduser().resolve()
    profiles = [
        layout.user_data / "sats-arena/dolphin-user/Config/Dolphin.ini",
        layout.config / "SatsArenaDolphin/Config/Dolphin.ini",
        layout.config / "SlippiOnline/Config/Dolphin.ini",
        workspace / "dolphin-controller-mcp/.runtime/config/SatsArenaDolphin/Config/Dolphin.ini",
        workspace / "dolphin-controller-mcp/.runtime/config/SlippiOnline/Config/Dolphin.ini",
    ]
    for profile in profiles:
        parser = configparser.ConfigParser(interpolation=None, strict=False)
        try:
            parser.read(profile, encoding="utf-8")
            candidate = parser.get("General", "LastFilename", fallback="").strip().strip('"')
        except (OSError, configparser.Error, UnicodeError):
            continue
        if valid_iso(candidate):
            return Path(candidate).expanduser().resolve()
    downloads = layout.home / "Downloads"
    try:
        candidates = sorted(downloads.iterdir())
    except OSError:
        candidates = []
    for candidate in candidates:
        if "melee" in candidate.name.lower() and candidate.suffix.lower() in (".iso", ".gcm") and valid_iso(candidate):
            return candidate.resolve()
    return None


def atomic_write(destination, mode, source=None, content=None):
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="." + destination.name + ".", dir=destination.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            if source is not None:
                with Path(source).open("rb") as original:
                    shutil.copyfileobj(original, handle)
            else:
                handle.write(content.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(mode)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def install(appimage, workspace, layout):
    workspace = Path(workspace).expanduser().resolve()
    appimage = Path(appimage).expanduser().resolve()
    if not appimage.is_file():
        raise ValueError("The built AppImage does not exist.")
    settings = read_settings(layout.settings)
    iso = find_iso(layout, workspace, settings)
    launcher_settings = settings.get("settings", {})
    changed = False
    # This local Arena fork must not install the upstream Slippi updater on quit.
    if launcher_settings.get("autoUpdateLauncher") is not False:
        launcher_settings["autoUpdateLauncher"] = False
        changed = True
    if iso and not valid_iso(launcher_settings.get("isoPath")):
        launcher_settings["isoPath"] = str(iso)
        changed = True
    binary = launcher_settings.get("satsArenaDolphinBinaryPath")
    if isinstance(binary, str) and binary:
        binary_path = Path(binary).expanduser()
        try:
            binary_path.resolve().relative_to(workspace / "Ishiiruka")
            old_workspace_binary = True
        except ValueError:
            old_workspace_binary = False
        if old_workspace_binary or not binary_path.is_file():
            launcher_settings["satsArenaDolphinBinaryPath"] = None
            changed = True
    wrapper = (
        "#!/usr/bin/env bash\nset -euo pipefail\n"
        "unset ELECTRON_RUN_AS_NODE NODE_ENV DEBUG_PROD\n"
        "export APPIMAGE_EXTRACT_AND_RUN=1\n"
        "umask 077\n"
        'state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/sats-arena"\n'
        'mkdir -p -- "$state_dir"\n'
        ': > "$state_dir/launcher.log"\n'
        'chmod 600 "$state_dir/launcher.log"\n'
        f"exec {shlex.quote(str(layout.appimage))} \"$@\" >\"$state_dir/launcher.log\" 2>&1\n"
    )
    atomic_write(layout.appimage, 0o755, source=appimage)
    atomic_write(layout.command, 0o755, content=wrapper)
    if changed:
        settings["settings"] = launcher_settings
        layout.user_data.mkdir(parents=True, mode=0o700, exist_ok=True)
        atomic_write(layout.settings, 0o600, content=json.dumps(settings, indent=2) + "\n")
    return iso


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--appimage", type=Path, help="Built release AppImage")
    parser.add_argument("--workspace", required=True, type=Path, help="Workspace containing slippi-launcher and dolphin-controller-mcp")
    parser.add_argument("--home", type=Path, help="Use an isolated home instead of HOME/XDG directories")
    parser.add_argument("--install-root", type=Path, help="Override the stable AppImage installation directory")
    parser.add_argument("--find-iso", action="store_true", help="Print only an existing Melee 1.02 ISO path, without installing")
    args = parser.parse_args(argv)
    layout = Layout(args.home, args.install_root)
    try:
        if args.find_iso:
            iso = find_iso(layout, args.workspace, read_settings(layout.settings))
            if iso:
                print(iso)
            return 0
        if args.appimage is None:
            parser.error("--appimage is required unless --find-iso is used")
        iso = install(args.appimage, args.workspace, layout)
        print(f"Installed Sats Arena: {layout.command}")
        print("Melee 1.02 ISO configured." if iso else "No Melee 1.02 ISO found; select your disc in the launcher.")
        return 0
    except (OSError, ValueError) as error:
        print(f"Sats Arena installation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
