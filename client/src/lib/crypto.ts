import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';


// Generate a random 32-byte private key
export function generatePrivateKey(): Uint8Array {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  return privateKey;
}

// Derive public key from private key using X25519
export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

/**
 * HKDF implementation using Web Crypto API
 */
export async function hkdf(secret: Uint8Array, salt: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(secret),
    'HKDF',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(new TextEncoder().encode(info)),
    },
    keyMaterial,
    length * 8
  );

  return new Uint8Array(derivedBits);
}

// Derive private key from recovery phrase (SEC-01: HKDF-based extraction)
export async function deriveKeyFromPhrase(phrase: string): Promise<Uint8Array> {
  if (!validateMnemonic(phrase, wordlist)) {
    throw new Error('Invalid recovery phrase');
  }
  const seed = mnemonicToSeedSync(phrase);
  
  // BIP39 seed is 512 bits. Use HKDF to extract a 256-bit (32-byte) key.
  // FIX 6: Replaced zero salt with proper deterministic salt and bumped version to v3
  const identityKey = await hkdf(
    seed, 
    new TextEncoder().encode('CipherLink-Identity-v3-salt'),
    "CipherLink-Identity-v3", 
    32
  );
  
  return identityKey;
}

// Validate a recovery phrase
export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(phrase, wordlist);
}

// Convert Uint8Array to hex string
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert hex string to Uint8Array
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

// Perform X25519 key exchange to derive a shared secret
export function deriveSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// Helper to convert Uint8Array to ArrayBuffer (avoids SharedArrayBuffer issues)
export function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

// Derive AES key from shared secret using HKDF
async function deriveAESKey(secret: Uint8Array, salt: Uint8Array, info: string = 'CipherLink Message Encryption'): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(secret),
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a message using AES-256-GCM
export async function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array
): Promise<{ ciphertext: string; nonce: string; ephemeralPublicKey: string; salt: string }> {
  // Generate ephemeral key pair for forward secrecy
  const ephemeralPrivateKey = generatePrivateKey();
  const ephemeralPublicKey = derivePublicKey(ephemeralPrivateKey);

  // Derive shared secret using ephemeral private key and recipient's public key
  const sharedSecret = deriveSharedSecret(ephemeralPrivateKey, recipientPublicKey);

  // Generate random salt for HKDF
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);

  // Derive AES key from shared secret with salt
  const aesKey = await deriveAESKey(sharedSecret, salt);

  // Generate random nonce (12 bytes for AES-GCM)
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);

  // Encrypt the message
  const encodedMessage = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    encodedMessage
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    nonce: bytesToHex(nonce),
    ephemeralPublicKey: bytesToHex(ephemeralPublicKey),
    salt: bytesToHex(salt),
  };
}

// Decrypt a message using AES-256-GCM (backward compatible with old messages)
export async function decryptMessage(
  ciphertext: string,
  nonce: string,
  ephemeralPublicKeyHex: string,
  salt: string | null | undefined,
  recipientPrivateKey: Uint8Array
): Promise<string> {
  const ephemeralPublicKey = hexToBytes(ephemeralPublicKeyHex);

  // Derive shared secret using recipient's private key and ephemeral public key
  const sharedSecret = deriveSharedSecret(recipientPrivateKey, ephemeralPublicKey);

  // SEC-04: Reject messages without salt — backward compatibility removed for security
  if (!salt) {
    throw new Error('Message format not supported: missing encryption salt');
  }
  const saltBytes = hexToBytes(salt);

  // Derive AES key from shared secret with salt
  const aesKey = await deriveAESKey(sharedSecret, saltBytes);

  // Decrypt the message
  const ciphertextBytes = hexToBytes(ciphertext);
  const nonceBytes = hexToBytes(nonce);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonceBytes) },
    aesKey,
    toArrayBuffer(ciphertextBytes)
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Generate an 8-character alphanumeric friend code with proper entropy
export function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters (removed confusing: 0, O, 1, I)
  let code = '';

  // Use rejection sampling to avoid modulo bias
  const randomBytes = new Uint8Array(16); // Extra bytes for rejection sampling
  crypto.getRandomValues(randomBytes);

  let byteIndex = 0;
  while (code.length < 8 && byteIndex < randomBytes.length) {
    const byte = randomBytes[byteIndex++];
    // Only use bytes that don't cause modulo bias (0-223 = 7 * 32)
    if (byte < 224) {
      code += chars[byte % chars.length];
    }
  }

  // If we ran out of bytes (very unlikely), generate more
  if (code.length < 8) {
    return generateFriendCode();
  }

  return code;
}

// Generate a complete identity (private key, public key, recovery phrase)
export async function generateIdentity(strength: 128 | 256 = 128): Promise<{
  privateKey: string;
  publicKey: string;
  recoveryPhrase: string;
}> {
  const recoveryPhrase = generateMnemonic(wordlist, strength);
  const privateKey = await deriveKeyFromPhrase(recoveryPhrase);
  const publicKey = derivePublicKey(privateKey);

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    recoveryPhrase,
  };
}

// Generate Ed25519 key pair for device identity
export function generateEd25519KeyPair(): { privateKey: string; publicKey: string } {
  const privateKey = generatePrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

// Get a human-readable device name
export function getDeviceName(): string {
  const userAgent = navigator.userAgent;
  if (/android/i.test(userAgent)) return "Android Device";
  if (/iPad|iPhone|iPod/.test(userAgent)) return "iOS Device";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Mac/i.test(userAgent)) return "MacBook / iMac";
  if (/Linux/i.test(userAgent)) return "Linux System";
  return "Web Browser";
}

// Restore identity from recovery phrase
export async function restoreIdentity(recoveryPhrase: string): Promise<{
  privateKey: string;
  publicKey: string;
  recoveryPhrase: string;
}> {
  const privateKey = await deriveKeyFromPhrase(recoveryPhrase);
  const publicKey = derivePublicKey(privateKey);

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    recoveryPhrase,
  };
}

// ==================== PIN-BASED IDENTITY ENCRYPTION (SEC-05 / HARDENED) ====================

/** Minimum required PIN length (enforced at crypto layer) */
export const MIN_PIN_LENGTH = 6;

/**
 * PIN stretching parameters (WebCrypto PBKDF2)
 * OWASP recommended minimum for PBKDF2-HMAC-SHA256 is 600,000 iterations.
 */
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_OUTPUT_LEN_BITS = 256;

/**
 * Zeroise a Uint8Array in-place.  Call after a key is no longer needed.
 * JavaScript GC is non-deterministic; this best-effort wipe reduces the
 * window during which key material lives in RAM.
 */
export function zeroizeBytes(buf: Uint8Array): void {
  buf.fill(0);
}

/** Enforce PIN length policy (≥ 6 chars).  Throws if violated. */
export function validatePin(pin: string): void {
  if (pin.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
  }
}

/**
 * Derive a raw 32-byte key from a user PIN using native WebCrypto PBKDF2.
 * The salt MUST be a fresh 16-byte random value per password.
 * This completely avoids WebAssembly/eval issues while maintaining high security.
 */
async function deriveRawKeyFromPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  validatePin(pin);
  
  const pinBuffer = new TextEncoder().encode(pin);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    pinBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    PBKDF2_OUTPUT_LEN_BITS
  );

  return new Uint8Array(derivedBits);
}

/** Derive a non-extractable AES-256-GCM CryptoKey from the PBKDF2 output. */
async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = await deriveRawKeyFromPin(pin, salt);
  try {
    return await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(rawKey),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  } finally {
    zeroizeBytes(rawKey); // wipe intermediate key material
  }
}

// Encrypt identity data with a user-provided PIN
export async function encryptIdentityWithPin(
  identityJson: string,
  pin: string
): Promise<{ salt: string; iv: string; data: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const aesKey = await deriveKeyFromPin(pin, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(identityJson)
  );
  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    data: bytesToHex(new Uint8Array(encrypted)),
  };
}

// ==================== IDENTITY FINGERPRINT & SAFETY NUMBER ====================

/**
 * Compute a stable fingerprint for a single identity public key.
 * fingerprint = SHA-256(identityPub)
 *
 * Used for TOFU (Trust On First Use) comparison and safety-number store.
 * When an identity key changes, the fingerprint changes — triggering
 * a re-verification requirement.
 */
export async function fingerprintIdentityKey(publicKeyBytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', toArrayBuffer(publicKeyBytes));
  return bytesToHex(new Uint8Array(hashBuf));
}

/**
 * Computes a safety number from two identity public keys.
 * Both parties MUST get the same result — order is canonicalized by sorting.
 *
 * Returns:
 *   hex        — raw 64-char hex string for programmatic use
 *   display    — 12-group of 5 digits (Signal-style) for human comparison
 *   bytes      — raw 32 bytes for QR code generation
 */
export async function computeSafetyNumber(
  localPublicKey: Uint8Array,
  remotePublicKey: Uint8Array
): Promise<{ hex: string; display: string; bytes: Uint8Array }> {
  // Canonical order: lexicographic sort ensures both participants compute identically
  const [first, second] =
    bytesToHex(localPublicKey) < bytesToHex(remotePublicKey)
      ? [localPublicKey, remotePublicKey]
      : [remotePublicKey, localPublicKey];

  const combined = new Uint8Array(first.length + second.length);
  combined.set(first, 0);
  combined.set(second, first.length);

  const hashBuf = await crypto.subtle.digest('SHA-256', combined);
  const bytes = new Uint8Array(hashBuf);
  const hex = bytesToHex(bytes);

  // Encode as 12 groups of 5 decimal digits (Signal-style)
  // We derive digits by treating each 4-byte chunk as a uint32 mod 100000
  const groups: string[] = [];
  const view = new DataView(hashBuf);
  // 256 bits = 8 x 4-byte chunks → 8 groups; pad remaining 4 with a second pass
  // Instead, use all 32 bytes → 12 groups of ~2.67 bytes each
  // Approach: interpret bytes as a big decimal number then extract digits
  // Simpler: treat each pair of bytes + 1 nibble as a 20-bit number mod 100000
  for (let i = 0; i < 12; i++) {
    const byteIdx = Math.floor((i * 20) / 8);
    const bitOffset = (i * 20) % 8;
    // Read 3 bytes (24 bits) and shift to get 20-bit value
    const b0 = bytes[byteIdx % 32];
    const b1 = bytes[(byteIdx + 1) % 32];
    const b2 = bytes[(byteIdx + 2) % 32];
    const val24 = (b0 << 16) | (b1 << 8) | b2;
    const val20 = (val24 >> (4 - bitOffset)) & 0xfffff; // 20 bits
    groups.push(String(val20 % 100000).padStart(5, '0'));
  }
  const display = groups.join(' ');

  return { hex, display, bytes };
}

// Decrypt identity data with a user-provided PIN
export async function decryptIdentityWithPin(
  encryptedData: { salt: string; iv: string; data: string },
  pin: string
): Promise<string> {
  const salt = hexToBytes(encryptedData.salt);
  const iv = hexToBytes(encryptedData.iv);
  const data = hexToBytes(encryptedData.data);
  const aesKey = await deriveKeyFromPin(pin, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    aesKey,
    toArrayBuffer(data)
  );
  return new TextDecoder().decode(decrypted);
}

// ==================== GENERIC PERSISTENCE ENCRYPTION (SEC-02/SEC-05) ====================

/**
 * Encrypts arbitrary data with a raw secret key (e.g. Identity Private Key).
 * Uses HKDF to derive a dedicated encryption key.
 */
export async function encryptWithSecret(
  plaintext: string,
  secret: Uint8Array,
  info: string
): Promise<{ salt: string; iv: string; ciphertext: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const aesKey = await deriveAESKey(secret, salt, info);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts data with a raw secret key and info string.
 */
export async function decryptWithSecret(
  encryptedData: { salt: string; iv: string; ciphertext: string },
  secret: Uint8Array,
  info: string
): Promise<string> {
  const salt = hexToBytes(encryptedData.salt);
  const iv = hexToBytes(encryptedData.iv);
  const ciphertext = hexToBytes(encryptedData.ciphertext);

  const aesKey = await deriveAESKey(secret, salt, info);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        aesKey,
        toArrayBuffer(ciphertext)
      );

  return new TextDecoder().decode(decrypted);
}
