#!/usr/bin/env node
// Canonical suites and dependencies moved to Backend. Exact pin is checked first.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.argv.length !== 2) throw Error('Run named suites directly in Backend; this helper runs both complete suites');
const result = spawnSync('python3', [fileURLToPath(new URL('./backend.py', import.meta.url)), 'rules'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
