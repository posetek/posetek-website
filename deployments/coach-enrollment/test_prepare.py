import importlib.util
from pathlib import Path
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('enrollment_prepare', Path(__file__).with_name('prepare.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
class Scope(unittest.TestCase):
    def test_exact_five_endpoints_and_closed_runtime(self):
        audit = release.configure()
        self.assertEqual(len(release.ENDPOINTS), 5)
        self.assertEqual(len(release.definitions()), 5)
        self.assertNotIn('completeAccountAccessLink', release.ENDPOINTS)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)
            for name in ('index.js', *release.FILES):
                original=Path(__file__).with_name(name) if name=='index.js' else ROOT/'functions'/name
                (source/name).write_bytes(original.read_bytes())
            closure=audit.scoped_runtime_module_closure(source, ('index.js', *release.FILES))
            self.assertIn('coach-enrollment.js', closure['localModules'])
            self.assertIn('account-deletion-state.js', closure['localModules'])
            self.assertNotIn('account-access.js', closure['localModules'])
            self.assertNotIn('account-deletion.js', closure['localModules'])
    def test_unsupported_computed_require_fails_closed(self):
        audit=release.configure()
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)
            (source/'package.json').write_text('{"dependencies":{}}',encoding='utf-8')
            (source/'index.js').write_text('require(something)',encoding='utf-8')
            with self.assertRaises(Exception): audit.scoped_runtime_module_closure(source,['index.js','package.json'])
if __name__=='__main__': unittest.main()
