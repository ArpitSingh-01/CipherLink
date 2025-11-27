import { x25519 } from '@noble/curves/ed25519.js';
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

// Generate a 12-word BIP39 recovery phrase
export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128); // 128 bits = 12 words
}

// Derive private key from recovery phrase
export function deriveKeyFromPhrase(phrase: string): Uint8Array {
  if (!validateMnemonic(phrase, wordlist)) {
    throw new Error('Invalid recovery phrase');
  }
  const seed = mnemonicToSeedSync(phrase);
  // Use first 32 bytes of the seed as the private key
  return seed.slice(0, 32);
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
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Perform X25519 key exchange to derive a shared secret
export function deriveSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// Derive AES key from shared secret using HKDF
async function deriveAESKey(sharedSecret: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // Could use a salt for additional security
      info: new TextEncoder().encode('CipherLink Message Encryption'),
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
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array
): Promise<{ ciphertext: string; nonce: string; ephemeralPublicKey: string }> {
  // Generate ephemeral key pair for forward secrecy
  const ephemeralPrivateKey = generatePrivateKey();
  const ephemeralPublicKey = derivePublicKey(ephemeralPrivateKey);
  
  // Derive shared secret using ephemeral private key and recipient's public key
  const sharedSecret = deriveSharedSecret(ephemeralPrivateKey, recipientPublicKey);
  
  // Derive AES key from shared secret
  const aesKey = await deriveAESKey(sharedSecret);
  
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
  };
}

// Decrypt a message using AES-256-GCM
export async function decryptMessage(
  ciphertext: string,
  nonce: string,
  ephemeralPublicKeyHex: string,
  recipientPrivateKey: Uint8Array
): Promise<string> {
  const ephemeralPublicKey = hexToBytes(ephemeralPublicKeyHex);
  
  // Derive shared secret using recipient's private key and ephemeral public key
  const sharedSecret = deriveSharedSecret(recipientPrivateKey, ephemeralPublicKey);
  
  // Derive AES key from shared secret
  const aesKey = await deriveAESKey(sharedSecret);
  
  // Decrypt the message
  const ciphertextBytes = hexToBytes(ciphertext);
  const nonceBytes = hexToBytes(nonce);
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    aesKey,
    ciphertextBytes
  );
  
  return new TextDecoder().decode(decryptedBuffer);
}

// Generate an 8-character alphanumeric friend code
export function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters (0, O, 1, I)
  let code = '';
  const randomValues = new Uint8Array(8);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 8; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
}

// Generate a complete identity (private key, public key, recovery phrase)
export function generateIdentity(): {
  privateKey: string;
  publicKey: string;
  recoveryPhrase: string;
} {
  const recoveryPhrase = generateRecoveryPhrase();
  const privateKey = deriveKeyFromPhrase(recoveryPhrase);
  const publicKey = derivePublicKey(privateKey);
  
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    recoveryPhrase,
  };
}

// Restore identity from recovery phrase
export function restoreIdentity(recoveryPhrase: string): {
  privateKey: string;
  publicKey: string;
} {
  const privateKey = deriveKeyFromPhrase(recoveryPhrase);
  const publicKey = derivePublicKey(privateKey);
  
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}
