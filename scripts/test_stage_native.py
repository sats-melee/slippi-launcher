#!/usr/bin/env python3
"""Fixture-only checks for native release staging and its launch boundary."""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest


STAGE = Path(__file__).with_name("stage-native.py")


class StageNativeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="arena release test ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.native_root = self.root / "native checkout"
        self.output = self.root / "App Image resources" / "sats-arena"
        self.binary = self.native_root / "build-arena/Binaries/dolphin-emu"
        self.sys_file = self.binary.parent / "Sys/GameSettings/test.ini"
        self.library = self.native_root / "build-arena/Source/Core/DolphinWX/libsats_arena_local.so"
        self.rust_library = self.library.with_name("libslippi_rust_extensions.so")
        self.audio = self.native_root / "Tools/arena/alsa-pulse.conf"
        for path, content in (
            (self.binary, b"fake native executable\n"),
            (self.sys_file, b"[fixture]\n"),
            (self.library, b"fake arena shared library\n"),
            (self.rust_library, b"fake Rust shared library\n"),
            (self.audio, b"pcm.!default { type pulse }\n"),
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        self.binary.chmod(0o755)

    def stage(self):
        result = subprocess.run(
            [sys.executable, str(STAGE), "--native-root", str(self.native_root), "--output", str(self.output)],
            check=True, capture_output=True, text=True,
        )
        return json.loads(result.stdout)

    def mock_environment(self):
        tools = self.root / "mock tools"
        tools.mkdir()
        distrobox = tools / "distrobox"
        distrobox.write_text(
            f"#!{sys.executable}\n"
            "import json, os, pathlib, sys\n"
            "result = dict(argv=sys.argv[1:], stdin=sys.stdin.buffer.read().hex(), "
            "inherited=os.environ.get('ARENA_WRAPPER_TEST'), pulse=os.environ.get('PULSE_SERVER'), alsa=os.environ.get('ALSA_CONFIG_PATH'))\n"
            "pathlib.Path(os.environ['ARENA_CAPTURE']).write_text(json.dumps(result))\n"
        )
        distrobox.chmod(0o755)
        return {
            **os.environ,
            "PATH": str(tools) + os.pathsep + os.environ["PATH"],
            "XDG_DATA_HOME": str(self.root / "shared data"),
            "ARENA_CAPTURE": str(self.root / "capture.json"),
            "ARENA_WRAPPER_TEST": "inherited environment value",
        }

    def launch_wrapper(self, env, args=(), payload=b"fixture stdin\n"):
        subprocess.run([str(self.output / "dolphin-emu"), *args], env=env, input=payload, check=True)
        return json.loads(Path(env["ARENA_CAPTURE"]).read_text())

    def test_payload_is_materialized_and_wrapper_has_no_checkout_dependency(self):
        # Native build outputs can be symlinks; the release must be self-contained.
        actual_library = self.root / "library source.so"
        self.library.rename(actual_library)
        self.library.symlink_to(actual_library)
        result = self.stage()
        self.assertEqual((self.output / "native/lib/libsats_arena_local.so").read_bytes(), actual_library.read_bytes())
        self.assertFalse((self.output / "native/lib/libsats_arena_local.so").is_symlink())
        self.assertEqual((self.output / "native/Sys/GameSettings/test.ini").read_bytes(), self.sys_file.read_bytes())
        wrapper = self.output / "dolphin-emu"
        self.assertTrue(wrapper.stat().st_mode & 0o100)
        self.assertNotIn(str(self.native_root), wrapper.read_text())
        self.assertIn(result["sha256"], wrapper.read_text())
        self.assertEqual((self.output / "native/.bundle-sha256").read_text().strip(), result["sha256"])

    def test_each_native_resource_invalidates_cache_and_hash_is_stable(self):
        previous = self.stage()["sha256"]
        self.assertEqual(self.stage()["sha256"], previous)
        for path in (self.binary, self.library, self.rust_library, self.sys_file, self.audio):
            with self.subTest(resource=path.name):
                path.write_bytes(path.read_bytes() + b"changed\n")
                current = self.stage()["sha256"]
                self.assertNotEqual(current, previous)
                previous = current

    def test_wrapper_preserves_stdin_arguments_and_environment_from_private_cache(self):
        digest = self.stage()["sha256"]
        shutil.rmtree(self.native_root)
        env = self.mock_environment()
        args = ["--exec", "ISO path with spaces.iso", "--literal=$(never-run)", "single'quote", ""]
        payload = b'{"fixture":"private synthetic handoff"}\n\x00tail\n'
        result = self.launch_wrapper(env, args, payload)
        cached = Path(env["XDG_DATA_HOME"]) / "sats-arena/runtime" / digest
        self.assertEqual(result["argv"], [
            "enter", "--name", "slippi-arena-build", "--no-tty", "--",
            "env", "GDK_BACKEND=x11", f"LD_LIBRARY_PATH={cached}/lib",
            str(cached / "dolphin-emu"), *args,
        ])
        self.assertEqual(bytes.fromhex(result["stdin"]), payload)
        self.assertEqual(result["inherited"], env["ARENA_WRAPPER_TEST"])
        self.assertEqual(cached.stat().st_mode & 0o777, 0o700)
        self.assertEqual(cached.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual((cached / "dolphin-emu").read_bytes(), b"fake native executable\n")
        self.assertTrue(all(path.stat().st_mode & 0o077 == 0 for path in cached.rglob("*")))
        inode = (cached / "dolphin-emu").stat().st_ino
        self.launch_wrapper(env)
        self.assertEqual((cached / "dolphin-emu").stat().st_ino, inode)

    def test_concurrent_wrapper_launches_share_a_complete_cache(self):
        digest = self.stage()["sha256"]
        env = self.mock_environment()
        environments = [{**env, "ARENA_CAPTURE": str(self.root / f"capture-{number}.json")} for number in range(4)]
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(self.launch_wrapper, environments))
        self.assertEqual(len(results), 4)
        cache = Path(env["XDG_DATA_HOME"]) / "sats-arena/runtime"
        self.assertEqual([path.name for path in cache.iterdir()], [digest])
        self.assertEqual((cache / digest / ".bundle-sha256").read_text().strip(), digest)

    def test_audio_uses_the_host_pulse_socket_and_bundled_config(self):
        digest = self.stage()["sha256"]
        env = self.mock_environment()
        runtime = self.root / "host runtime"
        (runtime / "pulse").mkdir(parents=True)
        pulse = runtime / "pulse/native"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
            server.bind(str(pulse))
            env["XDG_RUNTIME_DIR"] = str(runtime)
            env.pop("PULSE_SERVER", None)
            env.pop("ALSA_CONFIG_PATH", None)
            result = self.launch_wrapper(env)
            cached = Path(env["XDG_DATA_HOME"]) / "sats-arena/runtime" / digest
            self.assertEqual(result["pulse"], "unix:" + str(pulse))
            self.assertEqual(result["alsa"], str(cached / "alsa-pulse.conf"))
            self.assertEqual((cached / "alsa-pulse.conf").read_bytes(), self.audio.read_bytes())
            env.update(PULSE_SERVER="unix:/custom-server", ALSA_CONFIG_PATH="/custom audio.conf")
            result = self.launch_wrapper(env)
            self.assertEqual(result["pulse"], "unix:/custom-server")
            self.assertEqual(result["alsa"], "/custom audio.conf")

    def test_missing_resource_fails_before_changing_previous_bundle(self):
        digest = self.stage()["sha256"]
        self.rust_library.unlink()
        result = subprocess.run(
            [sys.executable, str(STAGE), "--native-root", str(self.native_root), "--output", str(self.output)],
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Native staging failed:", result.stderr)
        self.assertEqual((self.output / "native/.bundle-sha256").read_text().strip(), digest)


if __name__ == "__main__":
    unittest.main()
