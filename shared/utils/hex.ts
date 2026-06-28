/**
 * Safe hex ↔ bytes conversion utilities.
 */

export function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string (length ${hex?.length ?? 0})`);
  }
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string: non-hex characters detected');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
