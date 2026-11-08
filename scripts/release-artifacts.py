#!/usr/bin/env python3
"""Select a successful build of the release tag and stage only its release assets."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

ARTIFACTS = ('ubuntu-latest', 'windows-2022', 'macOS-latest')


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def tag_commit(tag):
    subprocess.run(['git', 'check-ref-format', 'refs/tags/' + tag], check=True, capture_output=True)
    sha = subprocess.check_output(['git', 'rev-parse', '--verify', 'refs/tags/' + tag + '^{commit}'], text=True).strip()
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('The release tag did not resolve to a commit')
    return sha


def artifact_ids(repo, run):
    artifacts = api(f'repos/{repo}/actions/runs/{run["id"]}/artifacts?per_page=100')['artifacts']
    chosen = []
    for name in ARTIFACTS:
        matches = [a for a in artifacts if a['name'] == name and not a['expired']]
        if len(matches) != 1:
            raise ValueError(f'Build {run["id"]} needs one unexpired {name} artifact; rerun the build')
        chosen.append(str(matches[0]['id']))
    return ','.join(chosen)


def resolve(repo, sha, run_id=None, wait=1800):
    workflow_id = api(f'repos/{repo}/actions/workflows/build.yml')['id']
    deadline = time.monotonic() + wait
    while True:
        if run_id:
            runs = [api(f'repos/{repo}/actions/runs/{run_id}')]
        else:
            runs = api(f'repos/{repo}/actions/workflows/build.yml/runs?head_sha={sha}&per_page=100')['workflow_runs']
        runs = [r for r in runs if r['head_sha'] == sha and r['workflow_id'] == workflow_id and
                r['event'] in ('push', 'workflow_dispatch')]
        if run_id and not runs:
            raise ValueError('The selected run is not a trusted build of the release tag commit')
        successful = sorted((r for r in runs if r['conclusion'] == 'success'), key=lambda r: r['id'], reverse=True)
        if successful:
            run = successful[0]
            return {'run_id': str(run['id']), 'sha': sha, 'artifact_ids': artifact_ids(repo, run)}
        if runs and all(r['status'] == 'completed' for r in runs):
            raise ValueError('The build of the release tag failed or was cancelled; rerun build.yml for that tag')
        if time.monotonic() >= deadline:
            raise ValueError('No successful build of the release tag; run build.yml for that tag, then retry')
        time.sleep(10)


def stage(downloads, output, version):
    if not re.fullmatch(r'[0-9][A-Za-z0-9.+-]*', version):
        raise ValueError('Invalid application version')
    base = 'Slippi-Launcher-' + version
    required = {base + '-x86_64.AppImage', 'Slippi-Launcher-Setup-' + version + '.exe',
                base + '-x64.dmg', base + '-arm64.dmg', base + '-x64-mac.zip',
                base + '-arm64-mac.zip', 'latest.yml', 'latest-linux.yml', 'latest-mac.yml'}
    optional = {base + '-' + arch + suffix for arch in ('x64', 'arm64')
                for suffix in ('.dmg.blockmap', '-mac.zip.blockmap')}
    optional.add('Slippi-Launcher-Setup-' + version + '.exe.blockmap')
    found = {}
    for path in downloads.rglob('*'):
        if path.is_symlink():
            raise ValueError('Release artifacts must not contain symlinks')
        if not path.is_file() or path.name not in required | optional:
            continue
        if path.name in found:
            raise ValueError('Duplicate release asset: ' + path.name)
        if not path.stat().st_size:
            raise ValueError('Empty release asset: ' + path.name)
        found[path.name] = path
    missing = required - found.keys()
    if missing:
        raise ValueError('Missing release assets: ' + ', '.join(sorted(missing)))
    if output.exists() and any(output.iterdir()):
        raise ValueError('Release output directory must be empty')
    output.mkdir(parents=True, exist_ok=True)
    for name, path in sorted(found.items()):
        shutil.copy2(path, output / name)
    return sorted(found)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    source = sub.add_parser('resolve')
    source.add_argument('--tag', required=True)
    source.add_argument('--repo', default=os.environ.get('GITHUB_REPOSITORY', 'sats-melee/slippi-launcher'))
    source.add_argument('--run-id', type=int)
    source.add_argument('--wait', type=int, default=1800)
    collect = sub.add_parser('stage')
    collect.add_argument('--downloads', type=Path, required=True)
    collect.add_argument('--output', type=Path, required=True)
    collect.add_argument('--version', required=True)
    args = parser.parse_args()
    if args.command == 'resolve':
        sha = tag_commit(args.tag)
        result = resolve(args.repo, sha, args.run_id, args.wait)
        package = subprocess.check_output(['git', 'show', sha + ':release/app/package.json'], text=True)
        result['version'] = json.loads(package)['version']
        if not re.fullmatch(r'[0-9][A-Za-z0-9.+-]*', result['version']):
            raise ValueError('Invalid tagged application version')
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                for key, value in result.items():
                    output.write(f'{key}={value}\n')
        print(json.dumps(result))
    else:
        print(json.dumps({'assets': stage(args.downloads, args.output, args.version)}))


if __name__ == '__main__':
    main()
