#!/usr/bin/env python3
"""Play consecutive CPU-wallet Sandbox matches in one freshly opened agent game.

Open it with sandbox-agent.py --cpu-wallets, then sandbox.sh local. Never edits
emulated memory or financial state. The session stays open for inspection.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
CONTROLLERS = ROOT.parent / 'dolphin-controller-mcp/scripts'
spec = importlib.util.spec_from_file_location('payment_game', ROOT / 'scripts/payment-game-e2e.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
command, wait_for, accrual = helpers.command, helpers.wait_for, helpers.accrual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.home() / '.local/share/sats-arena/cpu-session')
    parser.add_argument('--finishes', nargs='+', choices=['winner', 'cancel'], default=['winner', 'cancel', 'winner'])
    parser.add_argument('--play-seconds', type=int, default=15)
    parser.add_argument('--settlement-deadline', type=int, default=60)
    args = parser.parse_args()
    args.root = args.root.expanduser().resolve()
    evidence = ROOT / '.release/payment-session' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    evidence.mkdir(parents=True)
    report = {'status': 'running', 'scenario': 'cpu', 'rounds': [], 'evidence': str(evidence),
              'finishes': args.finishes, 'checks': {}, 'observer_errors': []}
    print(f'Evidence: {evidence}', flush=True)
    stop = threading.Event()
    observer = None
    observed = {}
    watched = []
    frozen = {}
    now_ms = lambda: time.time_ns() // 1_000_000

    def save():
        (evidence / 'result.json').write_text(json.dumps(report, indent=2) + '\n')

    try:
        info = json.loads(command([sys.executable, ROOT / 'scripts/sandbox-agent.py', '--root', args.root, '--status']))
        pid, profile = info['native_pid'], Path(info['profile'])
        if not pid:
            raise RuntimeError('Open the isolated CPU-wallet Sandbox game first')
        report.update(native_pid=pid, profile=str(profile))
        fixture = args.root / 'Slippi Launcher/sats-arena/sandbox/wallets.json'
        if not fixture.is_file():
            raise RuntimeError('The isolated Sandbox fixture is missing')
        state = wait_for(lambda: list((profile / 'SatsArenaSandbox').glob('*/prepaid-match.json')),
                         lambda paths: len(paths) == 1, 35, 'Sandbox ledger creation')[0]
        saved = lambda: json.loads(state.read_text())
        initial = saved()
        if initial['simulated'] or not initial['pot']['cpu_wallets']:
            raise RuntimeError('Use actual Sandbox payments with CPU wallets enabled')
        if initial['pot']['phase'] not in ('Funding', 'Settled') or any(initial['pot']['paid']):
            raise RuntimeError('Preserve the funded/active game; do not replace its match for this test')
        report['batch_seconds'] = initial['pot']['batch_window_ms'] / 1000
        ports = [1, 2]
        kinds = [1, 0, 3, 3]

        def read_match(match_id):
            current = saved()
            for candidate in [current, *current.get('pending_matches', [])]:
                if candidate['pot']['id'] == match_id:
                    return candidate
            return json.loads((state.parent / 'matches' / f'{match_id}.json').read_text())

        def ui(action, *extra):
            return json.loads(command(['distrobox', 'enter', '-n', 'slippi-arena-build', '--no-tty', '--',
                                       'env', 'GDK_BACKEND=x11', 'python3', CONTROLLERS / 'arena_ui.py',
                                       action, '--pid', pid, *extra]))

        def controller(action, *extra):
            return command([sys.executable, CONTROLLERS / 'arena_scenarios.py', '--user-dir',
                            profile, action, *extra])

        def observe():
            previous = None
            with (evidence / 'transitions.jsonl').open('w') as trace:
                while not stop.wait(.1):
                    try:
                        current = saved()
                        t = now_ms()
                        signature = (current['pot']['id'], current['pot']['phase'],
                                     tuple(current['pot']['paid']), len(current.get('pending_matches', [])))
                        if signature != previous:
                            trace.write(json.dumps({'at_ms': t, 'match_id': signature[0], 'phase': signature[1],
                                                    'paid': signature[2], 'background_matches': signature[3]}) + '\n')
                            trace.flush()
                            previous = signature
                        ids = list(watched)
                        if current['pot']['id'] not in ids:
                            ids.append(current['pot']['id'])
                        for mid in ids:
                            view = read_match(mid)
                            pot = view['pot']
                            times = observed.setdefault(mid, {})
                            if pot['phase'] == 'Funding':
                                times.setdefault('lobby_ms', t)
                                if all(view['invoices'][p - 1] for p in ports):
                                    times.setdefault('invoices_ms', t)
                                    times.setdefault('prior_payouts_pending_at_invoices', any(
                                        any(p['state'] not in ('Paid', 'Superseded', 'Discarded') for p in old['pot']['payouts'])
                                        for old in current.get('pending_matches', [])))
                            if pot['phase'] == 'Playing':
                                times.setdefault('admitted_ms', t)
                            if pot['outcome'] is not None:
                                times.setdefault('ended_ms', t)
                                frozen.setdefault(mid, accrual(pot))
                                if frozen[mid] != accrual(pot):
                                    raise AssertionError('Finished-match damage accounting changed')
                            if pot['phase'] == 'Settled':
                                times.setdefault('settled_ms', t)
                    except (OSError, ValueError, KeyError) as error:
                        report['observer_errors'].append(type(error).__name__)
                    except AssertionError as error:
                        report['observer_failure'] = str(error)
                        return

        observer = threading.Thread(target=observe, daemon=True)
        observer.start()
        ui('activate')
        time.sleep(3)
        controller('select', '--ports', ','.join(map(str, ports)))
        controller('cpu', '--ports', '1')
        previous_checks = None
        previous_hashes = set()
        for index, finish in enumerate(args.finishes, 1):
            print(f'Round {index}/{len(args.finishes)}: {finish}', flush=True)
            row = {'round': index, 'finish': finish, 'checks': {}}
            report['rounds'].append(row)
            controller('start', '--port', '2')
            room = wait_for(saved, lambda s: s['pot']['phase'] == 'Funding' and s['pot']['kinds'] == kinds
                            and all(s['invoices'][p - 1] for p in ports), 45, 'fresh verified entry invoices')
            mid = room['pot']['id']
            watched.append(mid)
            row['match_id'] = mid
            hashes = {room['hashes'][p - 1] for p in ports}
            if hashes & previous_hashes or len(hashes) != len(ports) or any(room['pot']['paid']):
                raise RuntimeError('A rematch reused an entry invoice or admission')
            previous_hashes.update(hashes)
            checks = [room['verification'][p - 1]['report']['checked_at_ms'] for p in ports]
            row['receiving_checks_reused'] = previous_checks == checks if previous_checks else None
            if previous_checks and previous_checks != checks:
                raise RuntimeError('Unchanged receiving addresses required another verification')
            previous_checks = checks
            row['checks']['fresh_invoices_and_unpaid_admission'] = True
            ui('capture', '--output', str(evidence / f'round-{index}-invoices.png'))
            # Start/attack inputs in a new unpaid room must not reuse the old game.
            controller('pills', '--port', '2', '--count', '1')
            pot = saved()['pot']
            if pot['phase'] != 'Funding' or pot['last_credit_sequence'] or pot['payouts']:
                raise RuntimeError('An unpaid rematch admitted gameplay or damage credits')
            for p in ports:
                started = now_ms()
                ui('fund', '--port', str(p))
                row.setdefault('entry_confirmation_ms', []).append(now_ms() - started)
                if p == ports[0] and saved()['pot']['phase'] != 'Funding':
                    raise RuntimeError('One entry admitted the whole match')
            row['funded_ms'] = now_ms()
            ui('activate')
            controller('start', '--port', '2')
            wait_for(saved, lambda s: s['pot']['id'] == mid and s['pot']['phase'] == 'Playing', 35, 'match admission')
            controller('battlefield', '--port', '2')
            read = lambda: read_match(mid)
            wait_for(read, lambda s: s['pot']['last_credit_sequence'] > 0, 40, 'actual CPU damage')
            deadline = time.monotonic() + args.play_seconds
            while time.monotonic() < deadline and read()['pot']['outcome'] is None:
                time.sleep(.2)
            wait_for(read, lambda s: any(p['reason'] == 'Damage' and p['state'] == 'Paid'
                                        for p in s['pot']['payouts']), 35, 'confirmed CPU damage payout')
            row['checks']['actual_cpu_damage_paid'] = True
            ui('capture', '--output', str(evidence / f'round-{index}-playing.png'))
            ui('activate')
            if finish == 'cancel':
                controller('no-contest', '--port', '2')
            else:
                for _ in range(80):
                    if read()['pot']['outcome'] is not None:
                        break
                    controller('walkoff', '--ports', '2', '--direction', 'right', '--seconds', '1')
            ended = wait_for(read, lambda s: s['pot']['outcome'] is not None, 15, 'controller-driven match end')
            if finish == 'cancel' and ended['pot']['outcome'] != 'NoContest':
                raise RuntimeError('The cancellation scenario did not end in No Contest')
            if finish == 'winner' and ended['pot']['outcome'] != {'Winner': 0}:
                raise RuntimeError('The actual CPU did not win the match')
            row['outcome'] = ended['pot']['outcome']
            row['checks']['observed_expected_finish'] = True
            ui('activate')
            summary = wait_for(lambda: ui('summary-state'), lambda v: v['visible'], 15, 'automatic results summary')
            helpers.check_summary(summary, ended['pot'])
            row['checks']['automatic_summary_matches_damage'] = True
            ui('capture', '--output', str(evidence / f'round-{index}-ended.png'))
            # Results need the game's normal Start acknowledgement; cancellations
            # return directly to CSS. Never wait for old wallet payouts here.
            presses = 0
            until = time.monotonic() + 25
            while (saved()['pot']['id'] == mid or ui('summary-state')['visible']) and time.monotonic() < until:
                ui('activate')
                controller('start', '--port', '2')
                presses += 1
                time.sleep(.2)
            lobby = wait_for(saved, lambda s: s['pot']['id'] != mid and s['pot']['phase'] == 'Funding'
                             and s['pot']['kinds'] == kinds and all(s['invoices'][p - 1] for p in ports),
                             30, 'next lobby and QR invoices without restarting')
            row['next_match_id'] = lobby['pot']['id']
            if ui('summary-state')['visible']:
                raise RuntimeError('The summary blocked the next lobby after controller Start')
            summary = ui('last-match')
            helpers.check_summary(summary, ended['pot'])
            ui('capture', '--output', str(evidence / f'round-{index}-last-match.png'))
            ui('activate')
            controller('start', '--port', '2')
            wait_for(lambda: ui('summary-state'), lambda v: not v['visible'], 10, 'controller closes Last match')
            row['checks']['last_match_review_and_controller_dismissal'] = True
            row['results_continue_presses'] = presses
            row['checks']['next_lobby_available_without_restart'] = True
            ui('capture', '--output', str(evidence / f'round-{index}-next-lobby.png'))
            next_times = wait_for(lambda: observed.get(lobby['pot']['id'], {}),
                                  lambda times: 'invoices_ms' in times, 2, 'observed next invoices')
            row['next_invoices_ms_after_end'] = next_times['invoices_ms'] - observed[mid]['ended_ms']
            row['older_payouts_pending_at_next_invoices'] = next_times['prior_payouts_pending_at_invoices']
            print(f'Round {index} ended; next invoices in {row["next_invoices_ms_after_end"]}ms', flush=True)
            save()

        for row in report['rounds']:
            mid = row['match_id']
            final = wait_for(lambda: read_match(mid), lambda s: s['pot']['phase'] == 'Settled',
                             args.settlement_deadline, 'confirmed final payouts')
            if accrual(final['pot']) != frozen.get(mid) or report.get('observer_failure'):
                raise RuntimeError('Finished-match accounting changed during later matches')
            row['checks']['accrual_frozen_during_later_matches'] = True
            # Freeze the exact completed state used by the independent wallet audit.
            snapshot = evidence / 'SatsArenaSandbox' / f'{mid}.json'
            snapshot.parent.mkdir(exist_ok=True)
            snapshot.write_text(json.dumps(final))
            receipt = command(['distrobox', 'enter', '-n', 'slippi-arena-build', '--no-tty', '--',
                               ROOT.parent / 'sats-arena/target/debug/examples/sandbox_receipts'], timeout=60,
                              input=json.dumps({'fixture': str(fixture), 'state': str(snapshot)}))
            row['wallet_receipts'] = json.loads(receipt)
            row['checks']['independent_wallet_receipts_confirmed'] = True
            row['attributed_payments'] = helpers.check_damage_descriptions(final, row['wallet_receipts'])
            row['checks']['paid_damage_descriptions_name_opponents'] = True
            row['accounting'] = json.loads(command([sys.executable, CONTROLLERS / 'audit_arena.py', snapshot]))[0]
            times = observed[mid]
            wait_for(lambda: times, lambda t: 'settled_ms' in t, 2, 'observed final confirmation')
            row['settlement_ms_after_end'] = times['settled_ms'] - times['ended_ms']
            if row['settlement_ms_after_end'] > args.settlement_deadline * 1000:
                raise RuntimeError('Final payout confirmation exceeded the settlement deadline')
            row['admission_ms_after_last_entry'] = max(0, times['admitted_ms'] - row['funded_ms'])
        stop.set()
        observer.join(timeout=2)
        timings = [json.loads(line) for line in state.with_name('payment-timings.jsonl').read_text().splitlines()]
        dispatched = [t for t in timings if t['stage'] == 'payment_dispatch'
                      and any(t['id'].startswith(mid + '-') for mid in watched)]
        ids = [t['id'] for t in dispatched]
        attempts = [(t['id'], t.get('attempt', 1)) for t in dispatched]
        if not ids or len(attempts) != len(set(attempts)):
            raise RuntimeError('Payout dispatches were missing or duplicated across matches')
        report['checks'].update(same_native_process=True, no_duplicate_payment_submissions=True,
                                no_stale_damage_after_match_end=True,
                                addresses_reused_without_reentry=True)
        report['status'] = 'passed'
        print('Consecutive CPU matches and independent payment receipts passed.', flush=True)
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        print(f'FAILED: {error}', flush=True)
    finally:
        stop.set()
        if observer:
            observer.join(timeout=2)
        save()
    return 0 if report['status'] == 'passed' else 2


if __name__ == '__main__':
    raise SystemExit(main())
