#!/usr/bin/env python3
"""Isolated release installation tests; no real user configuration is touched."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("release-install.py")
SPEC = importlib.util.spec_from_file_location("release_install", SCRIPT)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class ReleaseInstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sats-arena-install-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home with spaces"
        self.workspace = self.root / "projects"
        self.layout = installer.Layout(home=self.home)
        icon = self.workspace / "slippi-launcher/assets/icon.png"
        icon.parent.mkdir(parents=True)
        icon.write_bytes(b"test icon")
        self.appimage = self.root / "release.AppImage"
        self.appimage.write_bytes(b"#!/bin/sh\nexit 0\n")
        self.secret = self.layout.user_data / "sats-arena/nwc.txt"
        self.secret.parent.mkdir(parents=True)
        self.secret.write_text("NWC_SECRET_MUST_NOT_APPEAR")

    def disc(self, path=None, game=b"GALE01", revision=2):
        path = path or self.home / "Downloads/Super Smash Bros. Melee (USA) (v1.02).iso"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(game + bytes([0, revision]) + b"fake disc")
        return path

    def settings(self, value):
        self.layout.settings.parent.mkdir(parents=True, exist_ok=True)
        self.layout.settings.write_text(json.dumps(value))

    def test_install_preserves_wallet_and_settings(self):
        iso = self.disc()
        original = {"connections": ["keep"], "settings": {"satsArenaWalletBackend": "nwc", "theme": "dark", "autoUpdateLauncher": True}}
        self.settings(original)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = installer.main(["--appimage", str(self.appimage), "--workspace", str(self.workspace), "--home", str(self.home)])
        self.assertEqual(result, 0)
        saved = json.loads(self.layout.settings.read_text())
        self.assertEqual(saved["connections"], ["keep"])
        self.assertEqual(saved["settings"]["theme"], "dark")
        self.assertEqual(saved["settings"]["satsArenaWalletBackend"], "nwc")
        self.assertIs(saved["settings"]["autoUpdateLauncher"], False)
        self.assertEqual(saved["settings"]["isoPath"], str(iso))
        self.assertEqual(self.secret.read_text(), "NWC_SECRET_MUST_NOT_APPEAR")
        self.assertNotIn("NWC_SECRET", stdout.getvalue())
        self.assertEqual(stat.S_IMODE(self.layout.settings.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.layout.appimage.stat().st_mode), 0o755)
        self.assertIn("unset ELECTRON_RUN_AS_NODE NODE_ENV DEBUG_PROD", self.layout.command.read_text())
        self.assertIn("APPIMAGE_EXTRACT_AND_RUN=1", self.layout.command.read_text())
        self.assertFalse((self.layout.data / "applications/sats-arena.desktop").exists())
        self.assertFalse((self.layout.data / "icons/hicolor/256x256/apps/sats-arena.png").exists())
        # Execute the real wrapper against a harmless fake AppImage to verify
        # paths with spaces, argument forwarding, and its environment contract.
        self.layout.appimage.write_text("#!/usr/bin/env python3\nimport json, os, sys\nprint(json.dumps([sys.argv[1:], [os.getenv(k) for k in ('ELECTRON_RUN_AS_NODE', 'NODE_ENV', 'DEBUG_PROD')], os.getenv('APPIMAGE_EXTRACT_AND_RUN')]))\n")
        state = self.root / "state with spaces"
        env = dict(os.environ, HOME=str(self.home), XDG_STATE_HOME=str(state), ELECTRON_RUN_AS_NODE="1", NODE_ENV="development", DEBUG_PROD="1")
        output = subprocess.check_output([self.layout.command, "an argument", "second"], env=env, text=True)
        self.assertEqual(output, "")
        log = state / "sats-arena/launcher.log"
        self.assertEqual(json.loads(log.read_text()), [["an argument", "second"], [None, None, None], "1"])
        self.assertEqual(stat.S_IMODE(log.stat().st_mode), 0o600)

    def test_valid_iso_and_custom_binary_preserved(self):
        iso = self.disc(self.root / "chosen.iso")
        self.disc()
        binary = self.root / "custom dolphin"
        binary.write_text("custom")
        self.settings({"settings": {"isoPath": str(iso), "satsArenaDolphinBinaryPath": str(binary)}})
        installer.install(self.appimage, self.workspace, self.layout)
        settings = json.loads(self.layout.settings.read_text())["settings"]
        self.assertEqual(settings["isoPath"], str(iso))
        self.assertEqual(settings["satsArenaDolphinBinaryPath"], str(binary))
        self.assertNotIn("satsArenaWalletBackend", settings)

    def test_steam_launch_preserves_tracking_without_injected_overlay(self):
        installer.install(self.appimage, self.workspace, self.layout)
        self.layout.appimage.write_text("#!/usr/bin/env python3\nimport json, os\nprint(json.dumps([os.getenv(k) for k in ('LD_PRELOAD', 'SteamAppId', 'SteamGameId')]))\n")
        state = self.root / "steam-state"
        env = dict(os.environ, HOME=str(self.home), XDG_STATE_HOME=str(state),
                   LD_PRELOAD="libc.so.6", SteamAppId="2322420749", SteamGameId="9974721164540379136")
        subprocess.run([self.layout.command], env=env, check=True)
        log = state / "sats-arena/launcher.log"
        self.assertEqual(json.loads(log.read_text()), [None, "2322420749", "9974721164540379136"])
        del env["SteamAppId"]
        del env["SteamGameId"]
        subprocess.run([self.layout.command], env=env, check=True)
        self.assertEqual(json.loads(log.read_text()), ["libc.so.6", None, None])

    def test_profile_detection_and_old_workspace_override(self):
        iso = self.disc(self.root / "existing disc with spaces.iso")
        config = self.workspace / "dolphin-controller-mcp/.runtime/config/SatsArenaDolphin/Config/Dolphin.ini"
        config.parent.mkdir(parents=True)
        config.write_text(f"[General]\nLastFilename = {iso}\n")
        binary = self.workspace / "Ishiiruka/Tools/arena/launch-native.sh"
        binary.parent.mkdir(parents=True)
        binary.write_text("old wrapper")
        self.settings({"settings": {"isoPath": "/missing/disc.iso", "satsArenaDolphinBinaryPath": str(binary)}})
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            status = installer.main(["--find-iso", "--workspace", str(self.workspace), "--home", str(self.home)])
        self.assertEqual(status, 0)
        self.assertEqual(stdout.getvalue(), str(iso) + "\n")
        self.assertFalse(self.layout.appimage.exists())
        installer.install(self.appimage, self.workspace, self.layout)
        settings = json.loads(self.layout.settings.read_text())["settings"]
        self.assertEqual(settings["isoPath"], str(iso))
        self.assertIsNone(settings["satsArenaDolphinBinaryPath"])

    def test_malformed_settings_is_not_overwritten(self):
        self.layout.settings.write_text("not valid JSON")
        with self.assertRaisesRegex(ValueError, "leaving it unchanged"):
            installer.install(self.appimage, self.workspace, self.layout)
        self.assertEqual(self.layout.settings.read_text(), "not valid JSON")
        self.assertFalse(self.layout.appimage.exists())
        self.assertEqual(self.secret.read_text(), "NWC_SECRET_MUST_NOT_APPEAR")

    def test_no_disc_does_not_default_wallet_or_invent_iso(self):
        installer.install(self.appimage, self.workspace, self.layout)
        saved = json.loads(self.layout.settings.read_text())
        self.assertEqual(saved, {"settings": {"autoUpdateLauncher": False}})
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            status = installer.main(["--find-iso", "--workspace", str(self.workspace), "--home", str(self.home)])
        self.assertEqual(status, 0)
        self.assertEqual(stdout.getvalue(), "")

    def test_xdg_paths_and_explicit_home_isolation(self):
        env = {"HOME": str(self.home), "XDG_CONFIG_HOME": str(self.root / "config"), "XDG_DATA_HOME": str(self.root / "data")}
        layout = installer.Layout(environ=env)
        self.assertEqual(layout.settings, self.root / "config/Slippi Launcher/Settings")
        isolated = installer.Layout(home=self.home, environ=env)
        self.assertEqual(isolated.settings, self.home / ".config/Slippi Launcher/Settings")

    def test_existing_shortcuts_untouched(self):
        desktop = self.layout.data / "applications/sats-arena.desktop"
        desktop.parent.mkdir(parents=True)
        desktop.write_text("user shortcut")
        installer.install(self.appimage, self.workspace, self.layout)
        self.assertEqual(desktop.read_text(), "user shortcut")

    def test_rejects_wrong_game_and_revision(self):
        self.assertFalse(installer.valid_iso(self.disc(game=b"GAFP01")))
        self.assertFalse(installer.valid_iso(self.disc(revision=1)))
        self.assertFalse(installer.valid_iso(self.root / "missing.iso"))
        self.assertFalse(installer.valid_iso(None))
        self.assertTrue(installer.valid_iso(self.disc()))


if __name__ == "__main__":
    unittest.main()
