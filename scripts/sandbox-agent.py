#!/usr/bin/env python3
"""Open an isolated, repeatable sandbox launcher with four agent pipe controllers."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def game_info(root):
    profile = root / 'Slippi Launcher/sats-arena/dolphin-user'
    pid = None
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            args = (process / 'cmdline').read_bytes().split(b'\0')
            if str(profile).encode() in args and (process / 'exe').resolve().name == 'dolphin-emu':
                pid = int(process.name)
        except OSError:
            pass
    return {'config_root': str(root), 'profile': str(profile), 'native_pid': pid,
            'state_files': [str(p) for p in (profile / 'SatsArenaSandbox').glob('*/prepaid-match.json')]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, help='Override the persistent agent config root')
    parser.add_argument('--port', type=int, default=9338, help='Loopback Chromium debugging port')
    parser.add_argument('--wait', type=int, default=0, help='Wait up to this many seconds for the native game')
    parser.add_argument('--status', action='store_true', help='Print current agent game PID and ledger paths')
    parser.add_argument('--close-game', action='store_true', help='Close only the game using this agent profile')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose a debugging port between 1024 and 65535')
    home = Path.home()
    root = (args.root or Path(os.environ.get('XDG_DATA_HOME', home / '.local/share')) / 'sats-arena/agent').resolve()
    if args.status or args.close_game:
        info = game_info(root)
        until = time.monotonic() + min(max(args.wait, 0), 60)
        while args.status and not info['native_pid'] and time.monotonic() < until:
            time.sleep(.2)
            info = game_info(root)
        if args.close_game and info['native_pid']:
            windows = subprocess.run(['xdotool', 'search', '--pid', str(info['native_pid'])], capture_output=True, text=True).stdout.split()
            for window in windows:
                title = subprocess.run(['xdotool', 'getwindowname', window], capture_output=True, text=True).stdout
                if 'Slippi' in title:
                    subprocess.run(['xdotool', 'windowclose', window], check=True)
        print(json.dumps(info, indent=2))
        return
    normal = Path(os.environ.get('XDG_CONFIG_HOME', home / '.config')) / 'Slippi Launcher'
    subprocess.run(['bash', str(ROOT / 'scripts/sandbox.sh'), 'prepare'], check=True, stdout=subprocess.DEVNULL)
    settings = json.loads((normal / 'Settings').read_text())
    iso = settings.get('settings', {}).get('isoPath')
    if not iso or not Path(iso).is_file():
        raise RuntimeError('Choose your Melee ISO in the normal launcher first')
    user = root / 'Slippi Launcher'
    profile = user / 'sats-arena/dolphin-user'
    (profile / 'Config').mkdir(parents=True, exist_ok=True, mode=0o700)
    fixture = user / 'sats-arena/sandbox'
    fixture.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = fixture / 'wallets.json'
    shutil.copyfile(normal / 'sats-arena/sandbox/wallets.json', destination)
    destination.chmod(0o600)
    output = user / 'Settings'
    output.write_text(json.dumps({'settings': {'isoPath': iso, 'satsArenaWalletBackend': 'sandbox', 'satsArenaSatsPerPercent': 1, 'autoUpdateLauncher': False}}))
    output.chmod(0o600)
    (profile / 'Config/Dolphin.ini').write_text('[Core]\n' + ''.join(f'SIDevice{port} = 6\n' for port in range(4)) + '[Interface]\nConfirmStop = False\n[Input]\nBackgroundInput = True\n[Display]\nRenderWindowWidth = 1440\nRenderWindowHeight = 900\nFullscreen = False\n')
    bindings = {
        **{f'Buttons/{button.title() if button == "START" else button}': f'`Button {button}`' for button in ['A','B','X','Y','Z','START']},
        **{f'D-Pad/{name}': f'`Button D_{name.upper()}`' for name in ['Up','Down','Left','Right']},
        **{f'{stick} Stick/{direction}': f'`Axis {axis} {dimension} {sign}`' for stick, axis in [('Main','MAIN'),('C','C')] for direction,dimension,sign in [('Up','Y','+'),('Down','Y','-'),('Left','X','-'),('Right','X','+')]},
        'Main Stick/Dead Zone': '0', 'C-Stick/Dead Zone': '0',
        **{f'Triggers/{button}': f'`Button {button}`' for button in ['L','R']},
        **{f'Triggers/{button}-Analog': f'`Axis {button} +`' for button in ['L','R']},
    }
    pads = ''
    pipes = profile / 'Pipes'
    pipes.mkdir(exist_ok=True)
    for port in range(1, 5):
        fifo = pipes / f'codex{port}'
        if not fifo.exists():
            os.mkfifo(fifo, 0o600)
        pads += f'[GCPad{port}]\nDevice = Pipe/0/codex{port}\n' + ''.join(f'{key} = {value}\n' for key,value in bindings.items())
    (profile / 'Config/GCPadNew.ini').write_text(pads)
    launcher = home / '.local/bin/sats-arena'
    if not launcher.is_file():
        raise RuntimeError('Run make release once before opening the agent sandbox')
    env = dict(os.environ, XDG_CONFIG_HOME=str(root), XDG_STATE_HOME=str(root / 'state'))
    env['GTK_MODULES'] = 'gail:atk-bridge'
    for key in list(env):
        if key.startswith('SATS_ARENA_'):
            del env[key]
    with (root / 'process.log').open('w') as log:
        process = subprocess.Popen([str(launcher), '--remote-debugging-address=127.0.0.1', f'--remote-debugging-port={args.port}'], env=env, stdout=log, stderr=log, start_new_session=True)
    info = {'config_root': str(root), 'profile': str(profile), 'launcher_pid': process.pid, 'debug_port': args.port}
    (root / 'session.json').write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    main()
