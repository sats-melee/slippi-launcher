import importlib.util
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bundled_runtime', Path(__file__).with_name('check-bundled-runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def header(kind, x64=True):
    result = bytearray(80)
    if kind == 'elf':
        result[:6] = b'\x7fELF\x02\x01'
        struct.pack_into('<H', result, 18, 62 if x64 else 183)
    elif kind == 'macho':
        result[:4] = b'\xcf\xfa\xed\xfe'
        struct.pack_into('<I', result, 4, 0x01000007 if x64 else 0x0100000c)
    else:
        result[:2] = b'MZ'
        struct.pack_into('<I', result, 60, 64)
        result[64:70] = b'PE\0\0' + (b'\x64\x86' if x64 else b'\x64\xaa')
    return result


class BundleChecks(unittest.TestCase):
    def test_accepts_x64_and_rejects_arm_for_each_native_format(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / 'binary'
            for kind in ('elf', 'macho', 'pe'):
                with self.subTest(kind=kind):
                    binary.write_bytes(header(kind))
                    runtime.require_x64(binary)
                    binary.write_bytes(header(kind, x64=False))
                    with self.assertRaisesRegex(ValueError, 'Expected an x86_64'):
                        runtime.require_x64(binary)

    def test_rejects_scripts_and_empty_binaries(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / 'binary'
            for value in (b'', b'#!/bin/sh\nexit 0\n'):
                binary.write_bytes(value)
                with self.assertRaises(ValueError):
                    runtime.require_x64(binary)

    def test_missing_wallet_checker_fails_before_running_any_code(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'dolphin-emu.exe').write_bytes(header('pe'))
            with patch.object(runtime.subprocess, 'run') as execute:
                with self.assertRaises(FileNotFoundError):
                    runtime.check(root, 'win32')
                execute.assert_not_called()

    def test_relocated_bundle_checks_children_and_stops_server_on_success_or_bad_health(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('dolphin-emu.exe', 'sats-arena-wallet-check.exe', 'sats-arena-server.exe',
                         'sats_arena_local.dll', 'slippi_rust_extensions.dll'):
                (root / name).write_bytes(header('pe'))
            (root / 'Sys').mkdir()
            (root / 'Sys' / 'resource').write_bytes(b'game resource')
            checker = SimpleNamespace(returncode=0, stdout='{"ok":false,"message":"Wallet check requires an NWC connection"}')
            for healthy in (True, False):
                with self.subTest(healthy=healthy), \
                     patch.object(runtime.subprocess, 'run', return_value=checker) as execute, \
                     patch.object(runtime.subprocess, 'Popen') as start, \
                     patch.object(runtime.http.client, 'HTTPConnection') as http:
                    start.return_value.poll.return_value = None
                    response = http.return_value.getresponse.return_value
                    response.status = 200
                    response.read.return_value = (b'{"ok":true,"service":"sats-melee-rooms","version":1}'
                                                  if healthy else b'{"ok":true}')
                    if healthy:
                        runtime.check(root, 'win32')
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'invalid health response'):
                            runtime.check(root, 'win32')
                    self.assertEqual(execute.call_args.args[0], [str(root / 'sats-arena-wallet-check.exe')])
                    self.assertNotEqual(execute.call_args.kwargs['cwd'], str(root))
                    start.return_value.terminate.assert_called_once()
                    start.return_value.wait.assert_called_once_with(timeout=5)


if __name__ == '__main__':
    unittest.main()
