import test from 'node:test';
import assert from 'node:assert/strict';
import { sealReport } from './seal-parent-report.mjs';
import { parseReportFragment, decryptReport } from '../app/private-report/crypto.mjs';
const sample = {version:1, name:'Synthetic Athlete', playerId:'synthetic-only', metrics:[{percentile:50}]};
test('browser Web Crypto decrypts the exact offline report envelope', async () => {
  const sealed = sealReport(sample), parsed = parseReportFragment('#' + sealed.fragment);
  assert.deepEqual(await decryptReport(sealed.envelope, parsed.id, parsed.key), sample);
  assert(!sealed.envelope.includes(Buffer.from(sample.name)));
});
test('unique reports have distinct identifiers, keys and encrypted bytes', () => {
  const a=sealReport(sample), b=sealReport(sample);
  assert.notEqual(a.id,b.id); assert.notEqual(a.fragment,b.fragment); assert.notDeepEqual(a.envelope,b.envelope);
});
test('wrong key, altered identifier, ciphertext tampering and truncated envelope fail closed', async () => {
  const a=sealReport(sample), b=sealReport(sample), x=parseReportFragment(a.fragment), y=parseReportFragment(b.fragment);
  await assert.rejects(decryptReport(a.envelope,x.id,y.key));
  await assert.rejects(decryptReport(a.envelope,y.id,x.key));
  const corrupt=Buffer.from(a.envelope);corrupt[25]^=1;
  await assert.rejects(decryptReport(corrupt,x.id,x.key));
  await assert.rejects(decryptReport(a.envelope.slice(0,20),x.id,x.key));
});
test('malformed links cannot select arbitrary URLs or accept ambiguous keys', () => {
  for (const fragment of ['', '#', '#../private.key', '#https://evil.example/key', '#'+'a'.repeat(32)+'.'+'a'.repeat(43), '#'+'a'.repeat(32)+'.'+'a'.repeat(44)]) assert.equal(parseReportFragment(fragment),null);
  assert(parseReportFragment(sealReport(sample).fragment));
});
