#!/usr/bin/env python3
"""Check and execute the Arena runtime inside a staged or extracted launcher."""
import argparse
import http.client
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time


def require_x64(path):
    with path.open('rb') as stream:
        header = stream.read(64)
        if header[:4] == b'\x7fELF':
            valid = header[4:6] == b'\x02\x01' and struct.unpack_from('<H', header, 18)[0] == 62
        elif header[:4] == b'\xcf\xfa\xed\xfe':
            valid = struct.unpack_from('<I', header, 4)[0] == 0x01000007
        elif header[:2] == b'MZ':
            stream.seek(struct.unpack_from('<I', header, 60)[0])
            valid = stream.read(6) == b'PE\0\0\x64\x86'
        else:
            valid = False
    if not valid:
        raise ValueError(f'Expected an x86_64 executable or library: {path}')


def check(root, platform):
    root = root.resolve(strict=True)
    if platform == 'darwin':
        app = root / 'Slippi Dolphin.app' / 'Contents'
        game = app / 'MacOS' / 'Slippi Dolphin'
        checker = app / 'MacOS' / 'sats-arena-wallet-check'
        libraries = [app / 'Frameworks' / (name + '.dylib')
                     for name in ('libsats_arena_local', 'libslippi_rust_extensions')]
        resources = app / 'Resources' / 'Sys'
    elif platform == 'win32':
        game = root / 'dolphin-emu.exe'
        checker = root / 'sats-arena-wallet-check.exe'
        libraries = [root / name for name in ('sats_arena_local.dll', 'slippi_rust_extensions.dll')]
        resources = root / 'Sys'
    else:
        game = root / 'native' / 'dolphin-emu'
        checker = root / 'sats-arena-wallet-check'
        libraries = [root / 'native' / 'lib' / (name + '.so')
                     for name in ('libsats_arena_local', 'libslippi_rust_extensions')]
        resources = root / 'native' / 'Sys'
    server = root / ('sats-arena-server.exe' if platform == 'win32' else 'sats-arena-server')
    native_checker = root / 'native' / checker.name if platform == 'linux' else checker
    for binary in (game, native_checker, server, *libraries):
        require_x64(binary)
    if not resources.is_dir() or not any(resources.iterdir()):
        raise ValueError(f'Missing game resources: {resources}')
    env = {key: value for key, value in os.environ.items() if not key.startswith('SATS_ARENA_')}
    # An invalid backend is rejected before any wallet connection is attempted.
    with tempfile.TemporaryDirectory(prefix='arena-bundle-check-') as directory:
        env['XDG_DATA_HOME'] = directory
        result = subprocess.run([str(checker)], input='{"version":1,"backend":"invalid","nwc_uri":""}\n',
                                text=True, capture_output=True, timeout=15, cwd=directory, env=env)
        value = json.loads(result.stdout)
        if result.returncode != 0 or value != {'ok': False, 'message': 'Wallet check requires an NWC connection'}:
            raise RuntimeError('Bundled wallet checker failed its offline configuration check')
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        with tempfile.TemporaryFile() as log:
            child = subprocess.Popen([str(server), 'rooms', '--bind', f'127.0.0.1:{port}', '--frontend', directory],
                                     cwd=directory, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 15
                while True:
                    if child.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('Bundled server failed to start')
                    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=0.5)
                    try:
                        connection.request('GET', '/health')
                        response = connection.getresponse()
                        if response.status != 200 or json.loads(response.read()) != {
                            'ok': True, 'service': 'sats-melee-rooms', 'version': 1,
                        }:
                            raise RuntimeError('Bundled server returned an invalid health response')
                        break
                    except OSError:
                        time.sleep(0.1)
                    finally:
                        connection.close()
            except Exception:
                log.seek(0)
                print(log.read().decode(errors='replace'), file=sys.stderr)
                raise
            finally:
                if child.poll() is None:
                    child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
    print(f'{platform}: bundled x64 game/libraries, offline wallet checker and server /health passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path, help='assets/include/sats-arena in the package')
    args = parser.parse_args()
    check(args.root, sys.platform)
