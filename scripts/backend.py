#!/usr/bin/env python3
"""Use an explicitly pinned Backend checkout; never fetch or install implicitly."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

REPOSITORY = 'posetek/posetek-backend'
REMOTES = {f'git@github.com:{REPOSITORY}.git', f'https://github.com/{REPOSITORY}.git',
           f'https://github.com/{REPOSITORY}', f'ssh://git@github.com/{REPOSITORY}.git'}


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True, stderr=subprocess.PIPE).strip()


def resolve_backend(repo, pin):
    repo = Path(repo).resolve(strict=True)
    if pin.get('repository') != REPOSITORY or not re.fullmatch(r'[0-9a-f]{40}', pin.get('commit', '')):
        raise ValueError('Expected the reviewed Backend repository and full commit SHA')
    if Path(git(repo, 'rev-parse', '--show-toplevel')).resolve() != repo:
        raise ValueError('Backend path must be a repository root')
    if git(repo, 'remote', 'get-url', 'origin') not in REMOTES:
        raise ValueError('Backend origin is not canonical')
    if git(repo, 'rev-parse', 'HEAD') != pin['commit']:
        raise ValueError('Backend checkout differs from the pinned commit; use a detached checkout at the recorded SHA')
    if git(repo, 'status', '--porcelain', '--untracked-files=all', '--', 'firebase', 'functions', 'contracts', 'scripts', 'dev'):
        raise ValueError('Backend runtime/test inputs have uncommitted changes')
    # Detect hidden tracked edits even if assume-unchanged is set.
    paths = git(repo, 'ls-files', '--', 'firebase', 'functions', 'contracts', 'scripts', 'dev').splitlines()
    for name in paths:
        file = repo / name
        if file.is_symlink() or any(p.is_symlink() for p in file.parents if p != repo):
            raise ValueError('Backend source cannot be a symlink')
        expected = subprocess.check_output(['git', '-C', str(repo), 'show', f'{pin["commit"]}:{name}'])
        if not file.is_file() or file.read_bytes() != expected:
            raise ValueError(f'Backend source bytes differ: {name}')
    return repo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['verify', 'rules', 'emulators'])
    args = parser.parse_args()
    client = Path(__file__).resolve().parents[1]
    pin = json.loads((client / 'backend-source.json').read_text())
    repo = resolve_backend(os.environ.get('POSETEK_BACKEND_REPO', client.parent / 'posetek-backend'), pin)
    if args.command == 'verify':
        print(f'Verified {REPOSITORY}@{pin["commit"]}')
        return
    commands = [['npm', '--prefix', 'firebase', 'test'], ['npm', '--prefix', 'firebase', 'run', 'test:web-contracts']] if args.command == 'rules' else [['node', 'dev/emulators.mjs']]
    for command in commands:
        subprocess.run(command, cwd=repo, check=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        raise SystemExit(f'Backend development setup failed: {error}')
