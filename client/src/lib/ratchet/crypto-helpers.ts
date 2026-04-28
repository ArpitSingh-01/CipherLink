import { x25519, ed25519 } from '@noble/curves/ed25519.js';

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let res = '';
  for (let i = 0; i < bytes.length; i++) {
    res += bytes[i].toString(16).padStart(2, '0');
  }
  return res;
}

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

export function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

// P0-01/P0-02: X25519 from @noble/curves — raw 32-byte keys, no PKCS8 wrapping.
// secureClear() on raw bytes actually zeros the private key material.
export function generateRatchetKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

// Identity key pair — not used in ratchet.ts (auth.ts uses noble/ed25519 directly).
// Kept for any legacy callers; returns X25519 key pair consistent with crypto.ts.
export function generateIdentityKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  return generateRatchetKeyPair();
}

export async function getIdentityFingerprint(publicKeyBytes: Uint8Array): Promise<string> {
  const hash = await sha256(publicKeyBytes);
  return bytesToHex(hash);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}


export async function signData(privateKeyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return ed25519.sign(data, privateKeyBytes);
}

export async function verifySignature(publicKeyBytes: Uint8Array, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  try {
    return ed25519.verify(signature, data, publicKeyBytes);
  } catch {
    return false;
  }
}

// P0-01: X25519 DH — privateKeyBytes is a raw 32-byte scalar, publicKeyBytes is a raw 32-byte point.
export function dh(privateKeyBytes: Uint8Array, publicKeyBytes: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKeyBytes, publicKeyBytes);
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', toBuffer(data));
  return new Uint8Array(hash);
}

export async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, toBuffer(data));
  return new Uint8Array(signature);
}

export async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  outLengthBytes: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toBuffer(ikm),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  const infoBytes = new TextEncoder().encode(info);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBuffer(salt),
      info: toBuffer(infoBytes)
    },
    keyMaterial,
    outLengthBytes * 8
  );
  
  return new Uint8Array(bits);
}

export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const aesKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(nonce), additionalData: toBuffer(aad) },
    aesKey,
    toBuffer(plaintext)
  );
  
  return new Uint8Array(ciphertextBuffer);
}

export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const aesKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(nonce), additionalData: toBuffer(aad) },
    aesKey,
    toBuffer(ciphertext)
  );
  
  return new Uint8Array(plaintextBuffer);
}

export function secureClear(buf: Uint8Array) {
  buf.fill(0);
}

export function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function int32ToBytes(num: number): Uint8Array {
  const bytes = new Uint8Array(4);
  view(bytes).setUint32(0, num, false);
  return bytes;
}

export function int64ToBytes(num: number): Uint8Array {
  const bytes = new Uint8Array(8);
  view(bytes).setBigUint64(0, BigInt(num), false);
  return bytes;
}

export function now(): number {
  return Date.now();
}
