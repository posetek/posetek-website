"""Guard the repository boundary without accessing a private Backend checkout."""
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]

class BackendBoundaryTests(unittest.TestCase):
    def test_backend_runtime_and_rules_are_not_client_sources(self):
        for name in ['functions/index.js','firebase/firestore.rules','firebase/storage.rules','firestore.indexes.json','cors.json']:
            self.assertFalse((ROOT/name).exists(),name+' belongs in Backend')
        pin=json.loads((ROOT/'backend-source.json').read_text())
        self.assertEqual(pin['repository'],'posetek/posetek-backend')
        self.assertRegex(pin['commit'],r'^[0-9a-f]{40}$')
        config=ROOT/'firebase.json'
        if config.exists():
            self.assertEqual(set(json.loads(config.read_text())),{'hosting'})
