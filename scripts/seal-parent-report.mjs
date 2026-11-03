// Offline only. Neither plaintext nor the complete link belongs in Git or an artifact.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reportAdditionalData, MAX_ENVELOPE_BYTES } from '../app/private-report/crypto.mjs';
export function sealReport(report) {
  const id = randomBytes(24).toString('base64url');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(reportAdditionalData(id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
  const envelope = Buffer.concat([Buffer.from([1]), iv, ciphertext, cipher.getAuthTag()]);
  if (envelope.length > MAX_ENVELOPE_BYTES) throw new Error('Report too large');
  return { id, fragment: id + '.' + key.toString('base64url'), envelope };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, privateOutput] = process.argv.slice(2);
  if (!input || !privateOutput) throw new Error('Use: seal-parent-report.mjs <private-input.json> <private-output-directory>');
  const report = JSON.parse(await readFile(resolve(input), 'utf8'));
  const result = sealReport(report);
  await mkdir(privateOutput, {recursive:true, mode:0o700});
  await writeFile(join(privateOutput, result.id + '.bin'), result.envelope, {flag:'wx', mode:0o600});
  await writeFile(join(privateOutput, 'link-private.json'), JSON.stringify({ id:result.id, fragment:result.fragment }, null, 2) + '\n', {flag:'wx', mode:0o600});
  console.log('Encrypted report and private link record saved. No link printed.');
}
