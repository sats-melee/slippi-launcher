#!/usr/bin/env python3
"""Run actual controller-driven Sandbox payment checks. Never simulate receipts.

Requires host sockets, Distrobox, the display/session bus, and a built launcher.
Only isolated Sandbox profiles are used. Preserve fixtures and ledgers on failure.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
CONTROLLERS = WORKSPACE / 'dolphin-controller-mcp/scripts'


def command(args, *, env=None, timeout=60, input=None):
    result = subprocess.run([str(a) for a in args], cwd=ROOT, env=env, input=input,
                            capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed: {result.stderr[-2000:]}')
    return result.stdout


def wait_for(read, condition, timeout, label):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        value = read()
        if condition(value):
            return value
        time.sleep(.1)
    raise RuntimeError(f'Timed out: {label}')


def accrual(pot):
    """Payment confirmations may change after game end; hit accounting must not."""
    frozen = {key: pot[key] for key in ('id', 'outcome', 'last_credit_sequence',
                                      'damage_centi', 'fractional_sats', 'remaining',
                                      'unbatched', 'batch_deadline_ms')}
    frozen['damage_payouts'] = [{key: payout[key] for key in ('id', 'player', 'sats')}
                               for payout in pot['payouts'] if payout['reason'] == 'Damage']
    return frozen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', choices=['humans', 'cpu', 'cpu-four'], default='cpu')
    parser.add_argument('--no-build', action='store_true')
    parser.add_argument('--root', type=Path, default=Path.home() / '.local/share/sats-arena/payment-e2e')
    parser.add_argument('--port', type=int, default=0, help='Unused CDP port; 0 chooses a free port')
    parser.add_argument('--play-seconds', type=int, default=45)
    parser.add_argument('--batch-seconds', type=int, choices=range(1, 121), default=5)
    parser.add_argument('--settlement-deadline', type=int, default=60)
    parser.add_argument('--finish', choices=['winner', 'cancel'], default='winner')
    parser.add_argument('--restart-during-payout', action='store_true')
    parser.add_argument('--require-background-payments', action='store_true',
                        help='Require real older payouts to remain pending while this match is played')
    args = parser.parse_args()
    args.root = args.root.expanduser().resolve()
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    evidence = ROOT / '.release/payment-e2e' / timestamp
    evidence.mkdir(parents=True, exist_ok=True)
    report = {'scenario': args.scenario, 'status': 'running', 'end_to_end_passed': False,
              'finish': args.finish, 'restart_during_payout': args.restart_during_payout,
              'batch_seconds': args.batch_seconds,
              'settlement_deadline_seconds': args.settlement_deadline,
              'evidence': str(evidence), 'checks': {}}
    stop = threading.Event()
    observations = {'ended_ms': None, 'confirmed_ms': None, 'errors': [],
                    'post_end_samples': 0, 'settling_samples': 0, 'accrual_changes': []}
    report['observations'] = observations
    observer = None
    try:
        # Fail before launching or touching any game configuration if the session
        # cannot connect to actual wallets or the existing build container.
        try:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', args.port))
                args.port = probe.getsockname()[1]
                report['debug_port'] = args.port
            command(['distrobox', 'enter', '-n', 'slippi-arena-build', '--no-tty', '--', '/bin/true'])
        except (OSError, RuntimeError) as error:
            report['status'] = 'blocked'
            raise RuntimeError(f'Host network/container access is required: {error}') from error
        if not args.no_build:
            with (evidence / 'build.log').open('w') as log:
                subprocess.run(['bash', ROOT / 'scripts/release.sh'], cwd=ROOT, stdout=log,
                               stderr=subprocess.STDOUT, check=True, timeout=1800)
        env = dict(os.environ, ARENA_AGENT_DEBUG_PORT=str(args.port))
        launch = [sys.executable, ROOT / 'scripts/sandbox-agent.py', '--root', args.root,
                  '--port', args.port, '--batch-seconds', args.batch_seconds, '--payments-per-second', '1']
        info = json.loads(command(launch, env=env))
        if args.scenario != 'humans':
            command(['bash', ROOT / 'scripts/sandbox.sh', 'cpu-wallets', 'on'], env=env, timeout=90)
            wait_for(lambda: json.loads((args.root / 'Slippi Launcher/Settings').read_text()),
                     lambda s: s['settings'].get('satsArenaCpuWallets') is True,
                     10, 'CPU-wallet setting saved through Developer options')
            report['checks']['launcher_cpu_wallet_option'] = True
        command(['bash', ROOT / 'scripts/sandbox.sh', 'local'], env=env, timeout=90)
        info = json.loads(command([sys.executable, ROOT / 'scripts/sandbox-agent.py', '--root',
                                   args.root, '--status', '--wait', '30']))
        if not info['native_pid']:
            raise RuntimeError('The native game did not launch')
        profile = Path(info['profile'])
        pid = info['native_pid']
        report['profile'] = str(profile)
        report['native_pid'] = pid
        state = wait_for(lambda: list((profile / 'SatsArenaSandbox').glob('*/prepaid-match.json')),
                         lambda paths: len(paths) == 1, 35, 'Sandbox ledger creation')[0]
        fixture = args.root / 'Slippi Launcher/sats-arena/sandbox/wallets.json'

        def saved():
            return json.loads(state.read_text())

        def read_match(match_id):
            current = saved()
            for candidate in [current, *current.get('pending_matches', [])]:
                if candidate['pot']['id'] == match_id:
                    return candidate
            return json.loads((state.parent / 'matches' / f'{match_id}.json').read_text())

        def ui(action, *extra):
            return json.loads(command(['distrobox', 'enter', '-n', 'slippi-arena-build', '--no-tty',
                                       '--', 'env', 'GDK_BACKEND=x11', 'python3', CONTROLLERS / 'arena_ui.py', action,
                                       '--pid', pid, *extra]))

        def controller(action, *extra):
            return command([sys.executable, CONTROLLERS / 'arena_scenarios.py', '--user-dir',
                            profile, action, *extra])

        if saved()['simulated']:
            raise RuntimeError('Simulated wallets cannot pass this test')
        def background_payouts():
            return {p['id']: (p['sats'], p['player'], previous['prepared'][p['id']]['payment_hash'])
                    for previous in saved().get('pending_matches', [])
                    for p in previous['pot']['payouts'] if p['state'] == 'InFlight'}

        prior_payments = background_payouts() if args.require_background_payments else {}
        if args.require_background_payments and not prior_payments:
            raise RuntimeError('No real older in-flight payouts exist in this isolated profile')
        prior_accrual = {previous['pot']['id']: accrual(previous['pot'])
                         for previous in saved().get('pending_matches', [])}
        ui('activate')
        time.sleep(5)
        ports = [1, 2, 3, 4] if args.scenario == 'cpu-four' else [1, 2]
        controller('select', '--ports', ','.join(map(str, ports)))
        human = 1
        if args.scenario != 'humans':
            controller('cpu', '--ports', '1,3,4' if len(ports) == 4 else '1')
            human = 2
        controller('start', '--port', human)
        room = wait_for(saved, lambda s: s['pot']['phase'] == 'Funding'
                        and all(s['invoices'][i - 1] for i in ports), 40, 'verified entry invoices')
        if args.scenario != 'humans':
            expected = [1, 0, 1, 1] if len(ports) == 4 else [1, 0, 3, 3]
            if not room['pot'].get('cpu_wallets') or room['pot']['kinds'] != expected:
                raise RuntimeError('Financial CPU roster was not established through the launcher/game')
        print('Verified entry invoices and actual game roster', flush=True)
        ui('capture', '--output', str(evidence / 'entry-invoices.png'))
        ui('fund', '--port', '1')
        room = saved()
        if room['pot']['paid'][:2] != [True, False] or room['pot']['phase'] != 'Funding':
            raise RuntimeError('One entry incorrectly admitted the match')
        report['checks']['one_entry_blocks_start'] = True
        for port in ports[1:]:
            ui('fund', '--port', str(port))
        ui('activate')
        controller('start', '--port', human)
        wait_for(saved, lambda s: s['pot']['phase'] == 'Playing', 35, 'match admission')
        match_id = saved()['pot']['id']
        print(f'Admitted {match_id}', flush=True)

        def match():
            return read_match(match_id)

        def observe():
            frozen = None
            while not stop.wait(.1):
                try:
                    observed = match()['pot']
                    now = time.time_ns() // 1_000_000
                    if observed.get('outcome') is not None and observations['ended_ms'] is None:
                        observations['ended_ms'] = now
                        frozen = accrual(observed)
                        observations['accrual_at_match_end'] = frozen
                    if frozen is not None:
                        observations['post_end_samples'] += 1
                        observations['settling_samples'] += observed['phase'] == 'Settling'
                        if accrual(observed) != frozen and match_id not in observations['accrual_changes']:
                            observations['accrual_changes'].append(match_id)
                    for previous_id, previous in prior_accrual.items():
                        if (accrual(read_match(previous_id)['pot']) != previous
                                and previous_id not in observations['accrual_changes']):
                            observations['accrual_changes'].append(previous_id)
                    if observed['phase'] == 'Settled' and observations['confirmed_ms'] is None:
                        observations['confirmed_ms'] = now
                except (OSError, ValueError, KeyError) as error:
                    observations['errors'].append(type(error).__name__)

        observer = threading.Thread(target=observe, daemon=True)
        observer.start()
        controller('battlefield', '--port', human)
        if args.scenario == 'humans':
            controller('walkoff', '--ports', '2', '--direction', 'left', '--seconds', '1')
            controller('pills', '--port', '1', '--count', '3')
        wait_for(match, lambda s: s['pot']['last_credit_sequence'] > 0, 40, 'actual in-game damage')
        until = time.monotonic() + args.play_seconds
        while time.monotonic() < until and match()['pot'].get('outcome') is None:
            if args.scenario == 'humans':
                controller('pills', '--port', '1', '--count', '3')
            else:
                time.sleep(.5)  # The actual CPU generates gameplay actions.
        wait_for(match, lambda s: any(p['state'] == 'Paid' and p['reason'] == 'Damage'
                                     for p in s['pot']['payouts']), 35, 'confirmed damage payout')
        report['checks']['actual_damage_paid'] = True
        print('Actual gameplay damage payment confirmed', flush=True)
        if args.require_background_payments:
            outstanding = background_payouts()
            overlap = prior_payments.keys() & outstanding.keys()
            if not overlap:
                raise RuntimeError('Older payouts finished before background overlap was exercised')
            if any(prior_payments[key] != outstanding[key] for key in overlap):
                raise RuntimeError('Playing a new match changed an older in-flight payment')
            notice = ui('background')
            if not notice['visible'] or 'You can play a new match.' not in notice['text']:
                raise RuntimeError('The native background payout notice is missing during gameplay')
            report['background_payments_during_game'] = len(overlap)
            report['background_notice'] = notice
            report['checks']['new_match_played_while_prior_payments_pending'] = True
            report['checks']['older_payment_identities_preserved'] = True
            report['checks']['background_notice_visible_during_game'] = True
            ui('capture', '--output', str(evidence / 'playing-with-background-payments.png'))
        visible_ids = [p['id'] for p in match()['pot']['payouts']]
        outbound = wait_for(lambda: ui('outbound'),
                            lambda view: all(f'ID: {payout_id}\n' in view['text'] for payout_id in visible_ids),
                            10, 'every current payout in the outbound panel')
        (evidence / 'outbound-during.json').write_text(json.dumps(outbound, indent=2))
        ui('outbound', '--show', 'off')
        ui('outbound', '--show', 'on')
        report['checks']['outbound_checkbox_toggles'] = True
        ui('capture', '--output', str(evidence / 'gameplay.png'))
        ui('activate')
        in_flight = {p['id']: (p['sats'], p['player'], match()['prepared'][p['id']]['payment_hash'])
                     for p in match()['pot']['payouts'] if p['state'] == 'InFlight'}
        if args.finish == 'cancel':
            controller('no-contest', '--port', human)
        else:
            for _ in range(60):
                if match()['pot'].get('outcome') is not None:
                    break
                controller('walkoff', '--ports', '2', '--direction', 'right', '--seconds', '1')
        wait_for(match, lambda s: s['pot'].get('outcome') is not None, 10, 'controller-driven match end')
        print('Observed match end; checking that hit accounting stays frozen during settlement', flush=True)
        ui('capture', '--output', str(evidence / 'match-ended.png'))
        if args.finish == 'cancel' and not args.restart_during_payout:
            # Cancellation returns to the real CSS with the same selected roster.
            # Start and attack inputs must not admit or credit an unpaid rematch.
            ui('activate')
            controller('start', '--port', human)
            lobby = wait_for(saved, lambda s: s['pot']['id'] != match_id
                             and s['pot']['phase'] == 'Funding', 15, 'unpaid rematch lobby')
            if any(lobby['pot']['paid']) or lobby['pot']['last_credit_sequence'] != 0:
                raise RuntimeError('The rematch reused admission or damage credits')
            controller('pills', '--port', human, '--count', '5')
            time.sleep(5)
            lobby = saved()['pot']
            if (lobby['phase'] != 'Funding' or any(lobby['paid'])
                    or lobby['last_credit_sequence'] != 0 or lobby['payouts']):
                raise RuntimeError('Post-match inputs admitted or credited an unpaid rematch')
            report['checks']['unfunded_rematch_inputs_do_not_accrue'] = True
            ui('capture', '--output', str(evidence / 'unfunded-rematch.png'))
        original_hashes = {}
        if args.restart_during_payout:
            interrupted = wait_for(match, lambda s: any(p['state'] == 'InFlight'
                                   for p in s['pot']['payouts']), 15, 'in-flight payout before restart')
            original_hashes = {p['id']: interrupted['prepared'][p['id']]['payment_hash']
                               for p in interrupted['pot']['payouts'] if p['state'] == 'InFlight'}
            report['interrupted_payment_hashes'] = original_hashes
            if not original_hashes:
                raise RuntimeError('No in-flight payout was observed; restart recovery was not exercised')
            command([sys.executable, ROOT / 'scripts/sandbox-agent.py', '--root', args.root, '--close-game'])
            wait_for(lambda: json.loads(command([sys.executable, ROOT / 'scripts/sandbox-agent.py',
                     '--root', args.root, '--status'])), lambda s: s['native_pid'] is None,
                     15, 'isolated game shutdown')
            # The container wrapper can close just after its native process.
            # Retry the guarded LOCAL action until the launcher releases it.
            until_restart = time.monotonic() + 30
            while time.monotonic() < until_restart:
                command(['bash', ROOT / 'scripts/sandbox.sh', 'local'], env=env)
                info = json.loads(command([sys.executable, ROOT / 'scripts/sandbox-agent.py', '--root',
                                          args.root, '--status', '--wait', '2']))
                if info['native_pid']:
                    break
            if not info['native_pid']:
                raise RuntimeError('The isolated game did not restart')
            pid = info['native_pid']
        final = wait_for(match, lambda s: s['pot']['phase'] == 'Settled',
                         args.settlement_deadline, 'all payouts confirmed after match end')
        if (observations['post_end_samples'] == 0 or observations['accrual_changes']
                or accrual(final['pot']) != observations.get('accrual_at_match_end')
                or any(accrual(read_match(mid)['pot']) != frozen
                       for mid, frozen in prior_accrual.items())):
            raise RuntimeError('Finished-match hit accounting changed or was not observed')
        report['checks']['finished_match_accrual_frozen'] = True
        if prior_accrual:
            report['checks']['prior_matches_accrual_frozen_during_new_game'] = True
            report['prior_match_accrual'] = prior_accrual
        stop.set()
        observer.join(timeout=2)
        if observations['ended_ms'] is None:
            raise RuntimeError('Match-end time was not observed')
        confirmed = observations['confirmed_ms'] or time.time_ns() // 1_000_000
        observations['confirmed_ms'] = confirmed
        lag_ms = confirmed - observations['ended_ms']
        if lag_ms > args.settlement_deadline * 1000:
            raise RuntimeError(f'Post-match payment delay was {lag_ms}ms')
        report['settlement_lag_ms'] = lag_ms
        report['checks']['settlement_deadline_met'] = True
        for payout_id, (sats, player, payment_hash) in in_flight.items():
            payout = next(p for p in final['pot']['payouts'] if p['id'] == payout_id)
            if (payout['sats'], payout['player'], final['prepared'][payout_id]['payment_hash']) != (sats, player, payment_hash):
                raise RuntimeError('Match end replaced an in-flight payment')
        report['in_flight_payments_checked'] = len(in_flight)
        if in_flight:
            report['checks']['in_flight_payments_preserved'] = True
        if args.finish == 'cancel' and final['pot']['outcome'] != 'NoContest':
            raise RuntimeError('The controller cancellation was not observed')
        for payout_id, payment_hash in original_hashes.items():
            if final['prepared'][payout_id]['payment_hash'] != payment_hash:
                raise RuntimeError('Restart replaced an in-flight payment invoice')
        if original_hashes:
            report['checks']['restart_retained_original_payment_hashes'] = True
        if args.scenario == 'cpu' and args.finish == 'winner':
            if final['pot']['earned'][0] <= 0 or final['pot']['outcome'] != {'Winner': 0}:
                raise RuntimeError('The CPU did not receive a verified winning settlement')
            report['checks']['cpu_winnings_allocated'] = True
        submitted = []
        for line in state.with_name('payment-timings.jsonl').read_text().splitlines():
            timing = json.loads(line)
            if timing['stage'] == 'payment_dispatch' and timing['id'].startswith(f'{match_id}-'):
                submitted.append(timing)
        ids = [entry['id'].removeprefix('payout-') for entry in submitted]
        if len(ids) != len(set(ids)):
            raise RuntimeError('A payout was submitted more than once')
        starts = sorted(entry['started_at_ms'] for entry in submitted)
        if any(b - a < 950 for a, b in zip(starts, starts[1:])):
            raise RuntimeError('Payment submissions exceeded the configured one-per-second pace')
        for original in final['pot'].get('payout_replacements', {}):
            if original in ids:
                raise RuntimeError('A consolidated original was submitted')
        for player in range(4):
            settlements = [p for p in final['pot']['payouts'] if p['player'] == player
                           and p['reason'] == 'Settlement' and p['state'] != 'Superseded']
            if len(settlements) > 1:
                raise RuntimeError('Final settlement was split into multiple unsent payments')
        if not submitted:
            raise RuntimeError('No actual payment dispatches were recorded')
        report['checks']['paced_submissions_and_no_duplicate_sends'] = True
        report['consolidated_payment_count'] = len(final['pot'].get('payout_replacements', {}))
        if args.scenario == 'cpu-four' and args.batch_seconds == 1 and report['consolidated_payment_count'] == 0:
            raise RuntimeError('The four-player game did not exercise a payment backlog')
        report['payment_submission_timings'] = submitted
        report['observation_sampling_ms'] = 100
        spec = importlib.util.spec_from_file_location('arena_audit', CONTROLLERS / 'audit_arena.py')
        audit_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(audit_module)
        report['accounting'] = audit_module.audit(final)
        report['observations'] = observations
        visible_ids = [p['id'] for p in final['pot']['payouts']]
        for recovering in saved().get('pending_matches', []):
            visible_ids.extend(p['id'] for p in recovering['pot']['payouts'])
        for path in (state.parent / 'matches').glob('*.json'):
            visible_ids.extend(p['id'] for p in json.loads(path.read_text())['pot']['payouts'])
        outbound = wait_for(lambda: ui('outbound'),
                            lambda view: all(f'ID: {payout_id}\n' in view['text'] for payout_id in visible_ids),
                            10, 'every current and archived payout in the outbound panel')
        report['checks']['outbound_includes_every_payment'] = True
        (evidence / 'outbound-final.json').write_text(json.dumps(outbound, indent=2))
        ui('capture', '--output', str(evidence / 'settled.png'))
        # Query receiving wallets independently; do not use a local Paid flag as
        # the only evidence. Preserve the original financial snapshot on disk.
        archived = state.parent / 'matches' / f'{match_id}.json'
        receipt_state = archived if archived.exists() else state
        if json.loads(receipt_state.read_text())['pot']['id'] != match_id:
            raise RuntimeError('The completed match is not available for receipt verification')
        rust = WORKSPACE / 'Ishiiruka/build-tools'
        print(f'All payouts confirmed {lag_ms} ms after match end; checking receiving wallets', flush=True)
        receipt = command(['distrobox', 'enter', '-n', 'slippi-arena-build', '--no-tty', '--', 'env',
                           f'CARGO_HOME={rust / "cargo"}', f'RUSTUP_HOME={rust / "rustup"}',
                           'RUSTUP_TOOLCHAIN=1.88.0', rust / 'cargo/bin/cargo', 'run', '--quiet',
                           '--manifest-path', WORKSPACE / 'sats-arena/Cargo.toml', '-p',
                           'sats-arena-core', '--example', 'sandbox_receipts'], timeout=300,
                          input=json.dumps({'fixture': str(fixture), 'state': str(receipt_state)}))
        report['wallet_receipts'] = json.loads(receipt)
        report['checks']['independent_receiving_wallets_confirmed'] = True
        report['status'] = 'passed'
        report['end_to_end_passed'] = True
    except Exception as error:
        report['status'] = 'blocked' if report['status'] == 'blocked' else 'failed'
        report['error'] = str(error)
    finally:
        stop.set()
        if observer is not None:
            observer.join(timeout=2)
        if report['end_to_end_passed']:
            try:
                command([sys.executable, ROOT / 'scripts/sandbox-agent.py', '--root', args.root, '--close-game'])
                command(['bash', ROOT / 'scripts/sandbox.sh', 'close'], env=env)
                report['isolated_session_closed'] = True
            except Exception as error:
                report['cleanup_error'] = str(error)
        (evidence / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
    return 0 if report['end_to_end_passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
