#!/usr/bin/env python3
"""Release selection/staging checks using temporary Git repositories and mocked GitHub data."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_artifacts', Path(__file__).with_name('release-artifacts.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

REPO = 'sats-melee/slippi-launcher'
SHA = '1' * 40
VERSION = '1.2.3'
REQUIRED = {
    'Slippi-Launcher-1.2.3-x86_64.AppImage', 'Slippi-Launcher-Setup-1.2.3.exe',
    'Slippi-Launcher-1.2.3-x64.dmg', 'Slippi-Launcher-1.2.3-x64-mac.zip',
    'latest.yml', 'latest-linux.yml', 'latest-mac.yml',
}


def run(run_id=100, **changes):
    result = {'id': run_id, 'head_sha': SHA, 'workflow_id': 77, 'event': 'push',
              'status': 'completed', 'conclusion': 'success'}
    result.update(changes)
    return result


def artifacts():
    return [{'id': 201 + i, 'name': name, 'expired': False} for i, name in enumerate(release.ARTIFACTS)]


class SelectionTests(unittest.TestCase):
    def resolve(self, runs, available=None, run_id=None, sha=SHA):
        calls = []

        def api(path):
            calls.append(path)
            if path.endswith('/actions/workflows/build.yml'):
                return {'id': 77}
            if '/artifacts?' in path:
                return {'artifacts': copy.deepcopy(artifacts() if available is None else available)}
            if '/runs?head_sha=' in path:
                return {'workflow_runs': copy.deepcopy(runs)}
            if run_id is not None and path.endswith('/actions/runs/' + str(run_id)):
                return copy.deepcopy(runs[0])
            self.fail('Unexpected API request: ' + path)

        with patch.object(release, 'api', side_effect=api), patch.object(release.time, 'sleep') as sleep:
            result = release.resolve(REPO, sha, run_id=run_id, wait=0)
            sleep.assert_not_called()
        return result, calls

    def test_selects_newest_success_for_exact_sha_workflow_and_trusted_event(self):
        result, calls = self.resolve([run(9), run(12, conclusion='failure'), run(11, event='workflow_dispatch'),
                                      run(90, head_sha='2'*40), run(91, workflow_id=88),
                                      run(92, event='pull_request')])
        self.assertEqual(result, {'run_id': '11', 'sha': SHA, 'artifact_ids': '201,202,203'})
        self.assertIn(f'repos/{REPO}/actions/runs/11/artifacts?per_page=100', calls)

    def test_explicit_successful_run_is_used(self):
        result, _ = self.resolve([run(8, event='workflow_dispatch')], run_id=8)
        self.assertEqual(result['run_id'], '8')

    def test_explicit_wrong_sha_workflow_or_untrusted_event_is_rejected(self):
        for changes in ({'head_sha': '2'*40}, {'workflow_id': 88}, {'event': 'pull_request'},
                        {'event': 'pull_request_target'}):
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, 'not a trusted build'):
                self.resolve([run(8, **changes)], run_id=8)

    def test_failed_cancelled_or_skipped_build_is_rejected(self):
        for conclusion in ('failure', 'cancelled', 'skipped', 'timed_out'):
            with self.subTest(conclusion=conclusion), self.assertRaisesRegex(ValueError, 'failed or was cancelled'):
                self.resolve([run(conclusion=conclusion)])

    def test_missing_or_untrusted_only_builds_time_out_without_real_wait(self):
        for runs in ([], [run(event='pull_request')], [run(head_sha='2'*40)], [run(workflow_id=88)]):
            with self.subTest(runs=runs), self.assertRaisesRegex(ValueError, 'No successful build'):
                self.resolve(runs)

    def test_missing_expired_and_duplicate_platform_artifacts_are_rejected(self):
        missing = artifacts()[:-1]
        expired = artifacts(); expired[1]['expired'] = True
        duplicate = artifacts() + [dict(artifacts()[0], id=900)]
        for available in (missing, expired, duplicate):
            with self.subTest(available=available), self.assertRaisesRegex(ValueError, 'one unexpired'):
                self.resolve([run()], available)

    def test_expired_old_duplicate_and_unrelated_artifact_are_not_selected(self):
        available = artifacts() + [dict(artifacts()[0], id=900, expired=True),
                                   {'id': 999, 'name': 'debug-output', 'expired': False}]
        result, _ = self.resolve([run()], available)
        self.assertEqual(result['artifact_ids'], '201,202,203')

    def test_waits_for_in_progress_build_to_finish(self):
        replies = iter([{'workflow_runs': [run(status='in_progress', conclusion=None)]},
                        {'workflow_runs': [run()]}])

        def api(path):
            if path.endswith('/actions/workflows/build.yml'): return {'id': 77}
            if '/artifacts?' in path: return {'artifacts': artifacts()}
            return next(replies)

        with patch.object(release, 'api', side_effect=api), \
             patch.object(release.time, 'sleep') as sleep, \
             patch.object(release.time, 'monotonic', return_value=0):
            self.assertEqual(release.resolve(REPO, SHA, wait=30)['run_id'], '100')
            sleep.assert_called_once_with(10)


@contextlib.contextmanager
def temporary_git():
    with tempfile.TemporaryDirectory() as folder:
        previous = Path.cwd()
        os.chdir(folder)
        try:
            def git(*args):
                return subprocess.check_output(['git', '-c', 'user.name=Release Test', '-c',
                    'user.email=release@example.invalid', *args], text=True, stderr=subprocess.DEVNULL).strip()
            git('init', '-b', 'main')
            package = Path('release/app/package.json')
            package.parent.mkdir(parents=True)
            package.write_text(json.dumps({'version': VERSION}))
            git('add', '.'); git('commit', '-m', 'Tagged release source')
            tagged = git('rev-parse', 'HEAD')
            git('tag', 'v1.2.3')
            git('tag', '-a', 'v1.2.3-annotated', '-m', 'Annotated release')
            package.write_text(json.dumps({'version': '9.9.9'}))
            git('add', '.'); git('commit', '-m', 'Main moved past the tag')
            yield git, tagged
        finally:
            os.chdir(previous)


class TagTests(unittest.TestCase):
    def test_annotated_and_lightweight_tags_resolve_to_original_commit_after_main_moves(self):
        with temporary_git() as (git, tagged):
            self.assertNotEqual(git('rev-parse', 'HEAD'), tagged)
            self.assertEqual(release.tag_commit('v1.2.3'), tagged)
            self.assertEqual(release.tag_commit('v1.2.3-annotated'), tagged)

    def test_invalid_tag_ref_is_rejected(self):
        with temporary_git(), self.assertRaises(subprocess.CalledProcessError):
            release.tag_commit('../main')

    def test_cli_reads_version_and_build_sha_from_tag_not_moving_main(self):
        with temporary_git() as (_, tagged):
            output = Path('github-output')
            selected = {'run_id': '100', 'sha': tagged, 'artifact_ids': '201,202,203'}
            with patch.object(sys, 'argv', ['release-artifacts.py', 'resolve', '--tag', 'v1.2.3-annotated']), \
                 patch.object(release, 'resolve', return_value=selected) as resolve, \
                 patch.dict(os.environ, {'GITHUB_OUTPUT': str(output), 'GITHUB_REPOSITORY': REPO}), \
                 contextlib.redirect_stdout(io.StringIO()) as console:
                release.main()
            resolve.assert_called_once_with(REPO, tagged, None, 1800)
            self.assertEqual(json.loads(console.getvalue())['version'], VERSION)
            self.assertIn('version=1.2.3\n', output.read_text())
            self.assertIn('sha=' + tagged + '\n', output.read_text())


class StagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.downloads = self.root/'downloads'
        self.output = self.root/'release-assets'
        self.downloads.mkdir()
        for name in REQUIRED:
            self.asset(name)

    def asset(self, name, content=b'release payload'):
        parent = 'linux' if 'AppImage' in name or 'linux' in name else 'mac' if 'mac' in name or '.dmg' in name else 'windows'
        path = self.downloads/parent/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def stage(self):
        return release.stage(self.downloads, self.output, VERSION)

    def test_stages_only_expected_release_assets_and_keeps_source_bytes(self):
        optional = 'Slippi-Launcher-1.2.3-x64-mac.zip.blockmap'
        self.asset(optional, b'optional update archive')
        for ignored in ('builder-debug.yml', 'builder-effective-config.yaml', 'main.js.map',
                        'Slippi-Launcher-0.0.1-x64.dmg', 'Slippi-Launcher-1.2.3-arm64.dmg',
                        'Slippi-Launcher-1.2.3-arm64-mac.zip', 'notes.txt', 'unrelated.exe'):
            self.asset(ignored)
        self.assertEqual(self.stage(), sorted(REQUIRED | {optional}))
        self.assertEqual({p.name for p in self.output.iterdir()}, REQUIRED | {optional})
        self.assertEqual((self.output/optional).read_bytes(), b'optional update archive')
        self.assertTrue((self.downloads/'mac'/optional).is_file())

    def test_missing_required_asset_including_mac_updater_zips_fails_before_creating_output(self):
        for name in REQUIRED:
            with self.subTest(name=name):
                path = next(self.downloads.rglob(name)); path.unlink()
                with self.assertRaisesRegex(ValueError, 'Missing release assets'):
                    self.stage()
                self.assertFalse(self.output.exists())
                self.asset(name)

    def test_duplicate_asset_is_rejected(self):
        folder = self.downloads/'duplicate'; folder.mkdir()
        (folder/'latest.yml').write_bytes(b'duplicate')
        with self.assertRaisesRegex(ValueError, 'Duplicate release asset'):
            self.stage()

    def test_empty_required_or_optional_asset_is_rejected(self):
        for name in ('latest-mac.yml', 'Slippi-Launcher-Setup-1.2.3.exe.blockmap'):
            with self.subTest(name=name):
                self.asset(name, b'')
                with self.assertRaisesRegex(ValueError, 'Empty release asset'):
                    self.stage()
                self.asset(name)

    def test_file_or_directory_symlink_is_rejected_even_if_unrelated(self):
        for target in (self.root/'outside.txt', self.root/'outside-dir'):
            with self.subTest(target=target):
                if target.suffix: target.write_text('outside')
                else: target.mkdir()
                link = self.downloads/'unrelated-link'; link.symlink_to(target)
                with self.assertRaisesRegex(ValueError, 'must not contain symlinks'):
                    self.stage()
                link.unlink()

    def test_nonempty_output_is_preserved_and_rejected(self):
        self.output.mkdir()
        sentinel = self.output/'keep.txt'; sentinel.write_bytes(b'preserve')
        with self.assertRaisesRegex(ValueError, 'must be empty'):
            self.stage()
        self.assertEqual(sentinel.read_bytes(), b'preserve')
        self.assertEqual(list(self.output.iterdir()), [sentinel])

    def test_existing_empty_output_is_allowed(self):
        self.output.mkdir()
        self.assertEqual(self.stage(), sorted(REQUIRED))

    def test_invalid_version_cannot_select_paths_or_write_output(self):
        for version in ('../1.2.3', '1.2.3/evil', '', 'v1.2.3', '1.2.3\nother'):
            with self.subTest(version=version), self.assertRaisesRegex(ValueError, 'Invalid application version'):
                release.stage(self.downloads, self.output, version)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
