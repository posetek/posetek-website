// Report links grant read-only bearer access. They never authenticate workouts.
const ID = /^[A-Za-z0-9_-]{32}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;
export const MAX_ENVELOPE_BYTES = 2_000_000;
export function parseReportFragment(fragment) {
  const parts = fragment.replace(/^#/, '').split('.');
  if (parts.length !== 2 || !ID.test(parts[0]) || !KEY.test(parts[1])) return null;
  const key = decodeBase64Url(parts[1]);
  if (key.length !== 32 || encodeBase64Url(key) !== parts[1]) return null;
  return { id: parts[0], key };
}
export function encodeBase64Url(bytes) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBase64Url(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export function reportAdditionalData(id) {
  if (!ID.test(id)) throw new Error('Invalid report identifier');
  return new TextEncoder().encode('posetek-parent-report:v1:' + id);
}
export async function decryptReport(envelope, id, rawKey) {
  const bytes = new Uint8Array(envelope);
  if (bytes.length < 30 || bytes.length > MAX_ENVELOPE_BYTES || bytes[0] !== 1) throw new Error('Invalid report');
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes.slice(1, 13), additionalData:reportAdditionalData(id), tagLength:128}, key, bytes.slice(13));
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(plain));
}

/** A separate capability that can record activity but cannot decrypt a report. */
export async function reportTrackingToken(id, rawKey) {
  const key = await crypto.subtle.importKey('raw', rawKey, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const purpose = new TextEncoder().encode('posetek-one-pager-tracking:v1:' + id);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, purpose)));
}
