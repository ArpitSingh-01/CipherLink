import { SkippedKey } from './skipped.js';

export interface Header {
  version: number;
  cipher: string;
  direction: number;
  ratchetPubKey: Uint8Array;
  messageNumber: number;
  previousChainLength: number;
  sessionId: string;
}

export interface EncryptedMessage {
  header: Header;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  createdAt: number;
  expiresAt: number;
  ttlMs?: number;
}

export interface SessionState {
  // X3DH transcript hash — used as session ID in the ratchet protocol.
  // DIFFERENT from the IDB storage key (which is sort(localIdentityPub, remoteIdentityPub)).
  // These two IDs serve different purposes and must not be confused.
  sessionId: string;
  isInitiator: boolean;
  transcriptHash: Uint8Array;
  localIdentityPublicKey: Uint8Array;
  remoteIdentityPublicKey: Uint8Array;
  rootKey: Uint8Array;
  chainKeySend: Uint8Array;
  chainKeyRecv: Uint8Array;
  ratchetPrivateKey: Uint8Array;
  ratchetPublicKey: Uint8Array;
  remoteRatchetPublicKey: Uint8Array;
  sendMessageNumber: number;
  recvMessageNumber: number;
  globalSendMessageNumber: number;
  globalRecvMessageNumber: number;
  previousChainLength: number;
  skippedMessageKeys: Map<string, SkippedKey>;
  // IDB storage keys — both are X25519 identity keys (NOT Ed25519 device keys).
  // Named "session" to prevent confusion with Ed25519 device keys used in auth
  // and the transcript-bound identity keys (localIdentityPublicKey/remoteIdentityPublicKey).
  // NOTE: these hold the SAME value as localIdentityPublicKey / remoteIdentityPublicKey.
  // The redundancy exists because the ratchet module needs the key in two contexts
  // (transcript binding vs. IDB lookup). Do not deduplicate — tracked as tech debt.
  localSessionPublicKey: Uint8Array;
  remoteSessionPublicKey: Uint8Array;
  // 4-byte prefix + 8-byte BigUint64 counter = 12-byte (96-bit) nonce
  sessionNoncePrefix: Uint8Array;
  // O(1) replay guard: Set for fast lookup + FIFO queue for eviction
  seenNoncesSet: Set<string>;
  seenNoncesQueue: string[];
  // Legacy compat alias — kept in sync with seenNoncesQueue
  seenNonces: string[];
  createdAt: number;
  lastUsedAt: number;
}
