/**
 * Canonical byte-encoding utilities ()
 * 
 * Single source of truth for hex/base64/Uint8Array conversions.
 * Avoids duplicated helpers across crypto.ts, session.ts, and other modules.
 *
 * NOTE: The ratchet module (client/src/lib/ratchet/) has its own copy of these
 * helpers in crypto-helpers.ts. That module uses .js extension imports required
 * by its bundler configuration. Migration of ratchet imports is deferred to a
 * separate PR to avoid breaking the ratchet module's build.
 */

/** Convert Uint8Array to lowercase hex string */
export function bytesToHex(bytes: Uint8Array): string {
  let res = '';
  for (let i = 0; i < bytes.length; i++) {
    res += bytes[i].toString(16).padStart(2, '0');
  }
  return res;
}

/** Convert hex string to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Convert Uint8Array to base64 string */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64 string to Uint8Array */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Concatenate multiple Uint8Arrays into one */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const res = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    res.set(a, offset);
    offset += a.length;
  }
  return res;
}

/** Convert Uint8Array to ArrayBuffer (avoids SharedArrayBuffer issues) */
export function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

/** Constant-time byte comparison */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** Zero-fill a Uint8Array in-place (best-effort key zeroization) */
export function secureClear(buf: Uint8Array): void {
  buf.fill(0);
}
