"""Prepare and verify the five additive coach enrollment functions only."""
from __future__ import annotations
import argparse
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('coach_release_audit', HERE.parent / 'account-recovery' / 'prepare.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
audit = recovery.audit
ENDPOINTS = ('createCoachEnrollmentLink', 'inspectCoachEnrollmentLink', 'claimCoachEnrollmentLink', 'listCoachEnrollmentLinks', 'revokeCoachEnrollmentLink')
FILES = ('coach-enrollment.js', 'coach-enrollment-entrypoints.js', 'clubs.js', 'club-access.js', 'player-profile.js', 'athlete-storage-paths.js',
         'account-deletion-state.js', 'account-deletion-barrier.js', 'package.json', 'package-lock.json')
ONLY = ','.join('functions:' + name for name in ENDPOINTS)

def definitions():
    return {name: {'timeout': '30s' if name == 'inspectCoachEnrollmentLink' else '60s', 'availableMemoryMb': 256, 'maxInstances': 5,
                  'httpsTrigger': True, 'callable': True, 'publicInvoker': True, 'ingressSettings': 'ALLOW_ALL', 'secrets': []} for name in ENDPOINTS}

def validate(name, row, policy):
    expected = definitions()[name]
    audit.require(row and row.get('name') == audit.PARENT + '/functions/' + name and row.get('status') == 'ACTIVE'
                  and row.get('entryPoint') == name and row.get('runtime') == 'nodejs22', 'Unexpected active endpoint: ' + name)
    audit.require(audit.timeout_seconds(row.get('timeout')) == audit.timeout_seconds(expected['timeout'])
                  and row.get('availableMemoryMb', 256) == 256 and row.get('maxInstances') == 5, 'Capacity differs: ' + name)
    audit.require(row.get('serviceAccountEmail') == audit.PROJECT + '@appspot.gserviceaccount.com' and not row.get('vpcConnector')
                  and not row.get('secretVolumes') and not row.get('secretEnvironmentVariables') and row.get('environment', 'GEN_1') == 'GEN_1', 'Runtime binding differs: ' + name)
    audit.require(row.get('httpsTrigger', {}).get('url') == f'https://{audit.REGION}-{audit.PROJECT}.cloudfunctions.net/{name}'
                  and 'eventTrigger' not in row and row.get('labels', {}).get('deployment-callable') == 'true'
                  and not row.get('labels', {}).get('firebase-functions-codebase') and row.get('ingressSettings', 'ALLOW_ALL') == 'ALLOW_ALL', 'Transport differs: ' + name)
    bindings = policy.get('bindings', [])
    audit.require(any(b.get('role') == 'roles/cloudfunctions.invoker' and 'allUsers' in b.get('members', []) and not b.get('condition') for b in bindings)
                  and all(b.get('role') == 'roles/cloudfunctions.invoker' for b in bindings if 'allUsers' in b.get('members', [])), 'Public transport IAM differs: ' + name)
    return expected

def configure():
    audit.HERE, audit.ENDPOINTS, audit.FILES, audit.CALLABLES = HERE, ENDPOINTS, FILES, ENDPOINTS
    audit.FIREBASE_CONFIG = {'functions': {'source': 'source', 'runtime': 'nodejs22'}}
    audit.expected_definitions, audit.validate_definition = definitions, validate
    audit.scoped_runtime_module_closure = recovery.module_closure
    return audit

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['prepare', 'verify'], required=True)
    parser.add_argument('--run-dir', required=True)
    parser.add_argument('--credential-file', required=True)
    args = parser.parse_args()
    release = configure()
    run, api = release.private(args.run_dir), release.Api(args.credential_file)
    if args.mode == 'prepare':
        release.prepare(run, api)
        print(ONLY)
    else:
        release.verify(run, api)
