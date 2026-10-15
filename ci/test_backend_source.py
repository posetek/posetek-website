import importlib.util
import subprocess
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[1] / 'scripts/backend.py'
spec = importlib.util.spec_from_file_location('backend_client', path)
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class BackendSourceTests(unittest.TestCase):
    def test_wrong_origin_revision_and_hidden_changes_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d).resolve()
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], text=True, stderr=subprocess.PIPE).strip()
            git('init')
            git('config', 'user.email', 'fixture@example.invalid')
            git('config', 'user.name', 'Synthetic fixture')
            git('remote', 'add', 'origin', 'git@github.com:posetek/posetek-backend.git')
            (repo / 'firebase').mkdir()
            source = repo / 'firebase/firestore.rules'
            source.write_text('reviewed rules')
            git('add', '.')
            git('commit', '-m', 'Synthetic fixture')
            pin = {'repository': client.REPOSITORY, 'commit': git('rev-parse', 'HEAD')}
            self.assertEqual(client.resolve_backend(repo, pin), repo)
            with self.assertRaisesRegex(ValueError, 'pinned commit'):
                client.resolve_backend(repo, {**pin, 'commit': '0' * 40})
            git('remote', 'set-url', 'origin', 'git@github.com:someone/unrelated.git')
            with self.assertRaisesRegex(ValueError, 'canonical'): client.resolve_backend(repo, pin)
            git('remote', 'set-url', 'origin', 'git@github.com:posetek/posetek-backend.git')
            git('update-index', '--assume-unchanged', 'firebase/firestore.rules')
            source.write_text('hidden change')
            with self.assertRaisesRegex(ValueError, 'bytes differ'): client.resolve_backend(repo, pin)
