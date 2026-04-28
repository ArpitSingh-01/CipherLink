import { SessionState, EncryptedMessage, Header } from './types.js';
import { generateRatchetKeyPair, dh, concat, aesGcmEncrypt, aesGcmDecrypt, bytesToBase64, base64ToBytes, secureClear, sha256, int64ToBytes, bytesToHex, verifySignature, getIdentityFingerprint, hkdf, bytesEqual, view, now } from './crypto-helpers.js';
import { kdfChain, kdfRoot } from './kdf.js';
import { getSkippedMessageKey, storeSkippedMessageKey } from './skipped.js';

import { SkippedKey } from './skipped.js';

export const PROTOCOL_VERSION = 2;
export const CIPHER_SUITE = "AES-256-GCM";

// NOTE: Per-process nonce prefix removed — session.sessionNoncePrefix is the sole
// nonce domain separator (generated once per session in initSession, persisted in IDB).
// This avoids confusion between two separate prefix sources.

// ------------------------------------------------------------------
// SECURE PERSISTENT SESSION STORAGE DESIGN & TOFU HOOKS
// ------------------------------------------------------------------
export interface IPersistentHooks {
  onIdentityObserved: (sessionId: string, identityFingerprint: string) => Promise<boolean>;
  onRatchetKeyObserved: (sessionId: string, ratchetKeyFingerprint: string) => Promise<boolean>;
}

export let persistentHooks: IPersistentHooks | null = null;

export function setPersistentHooks(hooks: IPersistentHooks) {
  persistentHooks = hooks;
}

export function serializeSessionState(session: SessionState): string {
  const jsonSession: any = { ...session };
  jsonSession.skippedMessageKeys = Array.from(session.skippedMessageKeys.entries()).map(
    ([k, v]) => [k, { key: bytesToBase64(v.key), timestamp: v.timestamp }]
  );
  // Persist queue; Set is rebuilt on deserialize
  const queue = session.seenNoncesQueue ?? Array.from(session.seenNoncesSet ?? []);
  jsonSession.seenNoncesQueue = queue;
  jsonSession.seenNonces = queue; // legacy compat
  delete jsonSession.seenNoncesSet; // not JSON-serializable
  return JSON.stringify(jsonSession, (_key, val) => val instanceof Uint8Array ? bytesToBase64(val) : val);
}

export function deserializeSessionState(serialized: string): SessionState {
  const parsed = JSON.parse(serialized);
  const session: any = { ...parsed };

  const uint8Keys = [
    'transcriptHash', 'localIdentityPublicKey', 'remoteIdentityPublicKey',
    'rootKey', 'chainKeySend', 'chainKeyRecv', 'ratchetPrivateKey',
    'ratchetPublicKey', 'remoteRatchetPublicKey', 'localDevicePublicKey',
    'remoteDevicePublicKey', 'sessionNoncePrefix'
  ];
  for (const k of uint8Keys) {
    if (parsed[k]) session[k] = base64ToBytes(parsed[k]);
  }

  session.skippedMessageKeys = new Map<string, SkippedKey>();
  if (parsed.skippedMessageKeys) {
    for (const [k, v] of parsed.skippedMessageKeys) {
      session.skippedMessageKeys.set(k, { key: base64ToBytes(v.key), timestamp: v.timestamp });
    }
  }

  // Restore replay guard — upgrade to Set+FIFO queue
  // RT-03: Slice restored FIFO replay set queue to limit bound overflow
  let queue: string[] = Array.isArray(parsed.seenNoncesQueue)
    ? parsed.seenNoncesQueue
    : Array.isArray(parsed.seenNonces) ? parsed.seenNonces : [];
  if (queue.length > 2000) {
    queue = queue.slice(queue.length - 2000);
  }
  session.seenNoncesQueue = queue;
  session.seenNoncesSet = new Set<string>(queue);
  session.seenNonces = queue; // legacy compat

  if (!session.sessionNoncePrefix || session.sessionNoncePrefix.length !== 4) {
    if (session.sessionNoncePrefix && session.sessionNoncePrefix.length >= 4) {
      session.sessionNoncePrefix = session.sessionNoncePrefix.slice(0, 4);
    } else {
      throw new Error("Corrupted persistent session: missing or invalid nonce prefix");
    }
  }

  return session as SessionState;
}
// ------------------------------------------------------------------

// Deterministic Session ID generation
export async function deriveSessionId(key1: Uint8Array, key2: Uint8Array, transcriptHash: Uint8Array): Promise<string> {
  let a = key1;
  let b = key2;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      if (a[i] > b[i]) { a = key2; b = key1; }
      break;
    }
  }
  const versionByte = new Uint8Array([PROTOCOL_VERSION]);
  const hash = await sha256(concat(versionByte, a, b, transcriptHash));
  return bytesToHex(hash);
}

/**
 * initSession — X3DH key agreement (Signal spec-correct).
 *
 * Initiator (remotePreKey != null):
 *   DH1 = DH(IKa,  SPKb)
 *   DH2 = DH(EKa,  IKb)
 *   DH3 = DH(EKa,  SPKb)
 *
 * Responder (remotePreKey == null, senderEphemeralPub REQUIRED):
 *   DH1 = DH(SPKb, IKa)   ← mirrors initiator DH1
 *   DH2 = DH(IKb,  EKa)   ← mirrors initiator DH2
 *   DH3 = DH(SPKb, EKa)   ← mirrors initiator DH3
 *
 * Both sides produce identical sharedSecret = concat(DH1, DH2, DH3).
 *
 * For responder: localIdentityPriv = IKb_priv, localEphemeralPriv = SPKb_priv.
 */
export async function initSession(
  localIdentityPriv: Uint8Array,
  localIdentityPub: Uint8Array,
  localEphemeralPriv: Uint8Array,
  localEphemeralPub: Uint8Array,
  remoteIdentityPub: Uint8Array,
  remotePreKey: Uint8Array | null,
  remotePreKeySignature: Uint8Array | null,
  remoteIdentitySignPub: Uint8Array | null,
  localDevicePublicKey: Uint8Array,
  remoteDevicePublicKey: Uint8Array,
  senderEphemeralPub?: Uint8Array,   // REQUIRED for responder
  explicitIsInitiator?: boolean       // Override role detection instead of relying on remotePreKey !== null
): Promise<SessionState> {

  // TOFU identity check
  if (remoteIdentitySignPub) {
    if (bytesToHex(remoteIdentitySignPub) !== bytesToHex(remoteIdentityPub)) {
      throw new Error("MITM Protection: Identity key mismatch");
    }
  }

  // Verify pre-key signature
  if (remotePreKey && remotePreKeySignature && remoteIdentitySignPub) {
    const isValid = await verifySignature(remoteIdentitySignPub, remotePreKeySignature, remotePreKey);
    if (!isValid) {
      throw new Error("MITM Protection: Invalid remote pre-key signature");
    }
  }

  // When SPKb = IKb (our X3DH simplification without separate prekeys), the responder
  // still passes remotePreKey = remoteIdentityPub (non-null) to keep preKeyForHash
  // consistent with the initiator's transcript. Use explicitIsInitiator to override.
  const isInitiator = explicitIsInitiator !== undefined ? explicitIsInitiator : remotePreKey !== null;
  let sharedSecret: Uint8Array;

  if (isInitiator && remotePreKey) {
    // Initiator: localIdentityPriv = IKa_priv, localEphemeralPriv = EKa_priv
    const dh1 = dh(localIdentityPriv, remotePreKey);        // DH(IKa, SPKb)
    const dh2 = dh(localEphemeralPriv, remoteIdentityPub);  // DH(EKa, IKb)
    const dh3 = dh(localEphemeralPriv, remotePreKey);       // DH(EKa, SPKb)
    sharedSecret = concat(dh1, dh2, dh3);
    secureClear(dh1); secureClear(dh2); secureClear(dh3);
  } else {
    // Responder: localIdentityPriv = IKb_priv, localEphemeralPriv = SPKb_priv
    if (!senderEphemeralPub || senderEphemeralPub.length === 0) {
      throw new Error("X3DH responder requires senderEphemeralPub");
    }
    const rdh1 = dh(localEphemeralPriv, remoteIdentityPub);   // DH(SPKb, IKa)
    const rdh2 = dh(localIdentityPriv, senderEphemeralPub);   // DH(IKb,  EKa)
    const rdh3 = dh(localEphemeralPriv, senderEphemeralPub);  // DH(SPKb, EKa)
    sharedSecret = concat(rdh1, rdh2, rdh3);
    secureClear(rdh1); secureClear(rdh2); secureClear(rdh3);
  }

  // P2-07: Signal spec initial root KDF with fixed F constant (32×0xFF) as IKM for extract phase.
  // kdfRoot(rootKey, dhOutput, info) uses rootKey as HKDF salt and dhOutput as IKM (Signal-correct).
  // For the bootstrap step, we use F||sharedSecret as the IKM.
  const F = new Uint8Array(32).fill(0xFF);
  const zeroSalt = new Uint8Array(32);
  const derived = await kdfRoot(concat(F, sharedSecret), zeroSalt, "CipherLink-RootKDF");
  let rootKey = derived.newRootKey;

  // Bootstrap chains: used as initial recv chain placeholders.
  // The REAL send chain is derived below via the Signal-spec initial DH ratchet.
  const bootstrapChains = await hkdf(sharedSecret, zeroSalt, "CipherLink-InitChains-v2", 64);
  let initialChainSend: Uint8Array = isInitiator
    ? bootstrapChains.slice(0, 32)
    : bootstrapChains.slice(32, 64);
  let initialChainRecv: Uint8Array = isInitiator
    ? bootstrapChains.slice(32, 64)
    : bootstrapChains.slice(0, 32);
  secureClear(sharedSecret);
  secureClear(bootstrapChains);

  // ── Signal Double Ratchet: initial ratchet key and send chain ──────────
  //
  // Per the Signal spec (https://signal.org/docs/specifications/doubleratchet/):
  //
  //   Alice (initiator):
  //     DHs = GENERATE_DH()
  //     DHr = bob_signed_prekey (SPKb)
  //     RK, CKs = KDF_RK(SK, DH(DHs, DHr))     ← initial send chain
  //     CKr = not yet set
  //
  //   Bob (responder):
  //     DHs = SPKb_pair                          ← NOT a fresh random key!
  //     DHr = not yet set
  //     RK = SK
  //     CKs, CKr = not yet set
  //
  // When Bob receives Alice's first message, he triggers dhRatchet:
  //     DH(SPKb_priv, Alice_DHs_pub) = DH(Alice_DHs_priv, SPKb_pub)  [commutativity]
  //     ⇒ KDF_RK(SK, DH_out) produces SAME (RK, CKr) as Alice's (RK, CKs)
  //
  // CRITICAL: If Alice uses the bootstrap chain directly (no DH ratchet) or
  // Bob uses a fresh random ratchet key instead of SPKb, the DH outputs diverge
  // and AES-GCM decryption fails with OperationError.

  let ratchetKeyPair: { privateKey: Uint8Array; publicKey: Uint8Array };
  let remoteRatchetPublicKey: Uint8Array;

  if (isInitiator && remotePreKey) {
    // INITIATOR: generate fresh ratchet key pair, then do initial half-DH-ratchet
    ratchetKeyPair = generateRatchetKeyPair();
    remoteRatchetPublicKey = new Uint8Array(remotePreKey);

    // Signal spec: RK, CKs = KDF_RK(SK, DH(DHs, SPKb))
    const initDhOut = dh(ratchetKeyPair.privateKey, remoteRatchetPublicKey);
    const initRootResult = await kdfRoot(rootKey, initDhOut, "CipherLink-DHRatchet");
    secureClear(initDhOut);
    secureClear(rootKey);

    rootKey = initRootResult.newRootKey;
    initialChainSend = initRootResult.newChainKey;
    // initialChainRecv stays as bootstrap — will be overwritten when responder replies
  } else {
    // RESPONDER: initial ratchet key = SPKb pair (= IKb pair in our simplification)
    // This ensures dhRatchet on first receive computes DH(SPKb_priv, initRatchetPub)
    // which matches the initiator's DH(initRatchetPriv, SPKb_pub) by commutativity.
    ratchetKeyPair = {
      privateKey: new Uint8Array(localEphemeralPriv),  // copy — SPKb_priv = IKb_priv
      publicKey: new Uint8Array(localEphemeralPub),    // copy — SPKb_pub  = IKb_pub
    };
    remoteRatchetPublicKey = new Uint8Array(0);  // not yet received
    // chainKeySend/Recv stay as bootstrap — both overwritten by dhRatchet on first message
  }

  // TOFU persistence hook
  // Derive sessionId first so TOFU is bound to the correct per-session trust slot.
  // Transcript is STRICTLY role-neutral — both sides MUST compute identical transcriptHash.
  //
  // canonicalizeKeys: deterministic lexicographic sort on raw bytes so that neither
  // initiator nor responder perspective matters — the output is always [lower, higher].
  function canonicalizeKeys(a: Uint8Array, b: Uint8Array): [Uint8Array, Uint8Array] {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? [a, b] : [b, a];
    }
    return [a, b]; // equal length equal bytes — order is irrelevant
  }

  // Identity keys — canonical sort so both sides agree
  const [idLow, idHigh] = canonicalizeKeys(localIdentityPub, remoteIdentityPub);

  // Ephemeral key — initiator's EKa == responder's senderEphemeralPub (same wire key).
  // Canonical sort of localEphemeralPub vs senderEphemeralPub ensures IDENTICAL input
  // on both ends even if reference identity differs (effectively picks the single shared key).
  const ephA = localEphemeralPub;
  const ephB = senderEphemeralPub ?? localEphemeralPub;
  const [ephLow, ephHigh] = canonicalizeKeys(ephA, ephB);

  const preKeyForHash = remotePreKey ?? new Uint8Array(0);
  const algoBytes = new TextEncoder().encode("CipherLink-X3DH-ECDSA");
  const versionByte = new Uint8Array([PROTOCOL_VERSION]);

  // TRANSCRIPT FIX: The transcript must be IDENTICAL on both initiator and responder.
  // The only key BOTH sides share a reference to is the initiator's ephemeral (EKa):
  //   - Initiator holds it as localEphemeralPub
  //   - Responder receives it as senderEphemeralPub
  // Using canonicalize(localEphemeral, senderEphemeral) diverges when the responder sets
  // localEphemeral = IKb_pub (SPKb), so we instead extract EKa directly by role.
  const initiatorEphKey = isInitiator
    ? localEphemeralPub                           // Initiator: we generated EKa
    : (senderEphemeralPub ?? new Uint8Array(32)); // Responder: EKa arrived on the wire

  const transcriptHash = await sha256(concat(
    algoBytes,
    versionByte,
    idLow,        // canonical sort(IKa_pub, IKb_pub) — same on both sides
    idHigh,
    initiatorEphKey, // EKa_pub — same bytes on both sides
    preKeyForHash    // SPKb_pub = IKb_pub — same on both sides
  ));

  const sessionId = await deriveSessionId(localIdentityPub, remoteIdentityPub, transcriptHash);

  if (!persistentHooks) {
    throw new Error("No persistence hooks defined. Auto-accept TOFU is disabled.");
  }
  const remoteFp = await getIdentityFingerprint(remoteIdentityPub);
  // P0-05: Pass real sessionId as the trust slot key (was hardcoded "INIT" — shared all sessions)
  const fpAllowed = await persistentHooks.onIdentityObserved(sessionId, remoteFp);
  if (!fpAllowed) {
    throw new Error("MITM Protection: Identity rejected by persistent TOFU storage");
  }

  // 4-byte random prefix + 8-byte counter = 12-byte nonce
  const sessionNoncePrefix = new Uint8Array(4);
  crypto.getRandomValues(sessionNoncePrefix);

  const seenNoncesQueue: string[] = [];
  const seenNoncesSet = new Set<string>();

  return {
    sessionId,
    isInitiator,
    transcriptHash,
    localIdentityPublicKey: localIdentityPub,
    remoteIdentityPublicKey: remoteIdentityPub,
    rootKey,
    chainKeySend: initialChainSend,
    chainKeyRecv: initialChainRecv,
    ratchetPrivateKey: ratchetKeyPair.privateKey,
    ratchetPublicKey: ratchetKeyPair.publicKey,
    remoteRatchetPublicKey,
    sendMessageNumber: 0,
    recvMessageNumber: 0,
    globalSendMessageNumber: 0,
    globalRecvMessageNumber: 0,
    previousChainLength: 0,
    skippedMessageKeys: new Map<string, SkippedKey>(),
    localDevicePublicKey,
    remoteDevicePublicKey,
    sessionNoncePrefix,
    seenNonces: seenNoncesQueue,     // legacy compat field
    seenNoncesQueue,
    seenNoncesSet,
    createdAt: now(),
    lastUsedAt: now()
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

// Chunk-safe base64 encoding — no spread or Array.from to avoid implicit copies
// of sensitive data and stack overflow on large buffers.
function toBase64(u8: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, u8.length);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(u8[j]);
    }
  }
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function buildAAD(header: Uint8Array, createdAt: number, expiresAt: number): Uint8Array {
  return concat(header, int64ToBytes(createdAt), int64ToBytes(expiresAt));
}

function serializeHeader(header: Header): Uint8Array {
  return encoder.encode(JSON.stringify({
    version: header.version,
    cipher: header.cipher,
    direction: header.direction,
    ratchetPubKey: toBase64(header.ratchetPubKey),
    messageNumber: header.messageNumber,
    previousChainLength: header.previousChainLength,
    sessionId: header.sessionId
  }));
}

function checkNonce(session: SessionState, msgId: string): void {
  // Migrate legacy sessions that only have seenNonces array
  if (!session.seenNoncesSet) {
    session.seenNoncesQueue = [...(session.seenNonces ?? [])];
    session.seenNoncesSet = new Set<string>(session.seenNoncesQueue);
  }
  if (session.seenNoncesSet.has(msgId)) {
    throw new Error("Replay Protection: duplicate nonce detected");
  }
}

function commitNonce(session: SessionState, msgId: string): void {
  if (!session.seenNoncesSet) {
    session.seenNoncesQueue = [...(session.seenNonces ?? [])];
    session.seenNoncesSet = new Set<string>(session.seenNoncesQueue);
  }
  session.seenNoncesSet.add(msgId);
  session.seenNoncesQueue.push(msgId);
  // P1-02: Also enforce monotonic globalRecvMessageNumber as the eviction floor.
  // A replayed old message whose nonce was evicted from the FIFO set is caught here.
  // (globalRecvMessageNumber check in decryptMessage handles the main case;
  //  this keeps the set bounded at 2000 for recent messages only.)
  if (session.seenNoncesQueue.length > 2000) {
    const evicted = session.seenNoncesQueue.shift()!;
    session.seenNoncesSet.delete(evicted);
  }
  session.seenNonces = session.seenNoncesQueue; // keep legacy in sync
}

// ─────────────────────────────────────────────────────────────────────
// DH Ratchet
// ─────────────────────────────────────────────────────────────────────

export async function dhRatchet(session: SessionState, receivedRatchetKey: Uint8Array): Promise<void> {
  if (bytesEqual(receivedRatchetKey, session.ratchetPublicKey)) {
    throw new Error("Invalid ratchet key: self key reuse detected");
  }

  if (!persistentHooks) {
    throw new Error("No persistence hooks defined for Ratchet updates.");
  }
  const rKfp = await getIdentityFingerprint(receivedRatchetKey);
  const rKallowed = await persistentHooks.onRatchetKeyObserved(session.sessionId, rKfp);
  if (!rKallowed) throw new Error("DH Ratchet Key rejected by trust anchor.");

  // Execute crypto first, commit state at the very end
  const dh1 = dh(session.ratchetPrivateKey, receivedRatchetKey);
  const rootResult1 = await kdfRoot(session.rootKey, dh1, "CipherLink-DHRatchet");
  secureClear(dh1);

  const newPair = generateRatchetKeyPair();

  const dh2 = dh(newPair.privateKey, receivedRatchetKey);
  const rootResult2 = await kdfRoot(rootResult1.newRootKey, dh2, "CipherLink-DHRatchet");
  secureClear(dh2);

  // Atomic state commit
  secureClear(session.rootKey);
  secureClear(session.ratchetPrivateKey);

  session.previousChainLength = session.recvMessageNumber;
  session.sendMessageNumber = 0;
  session.recvMessageNumber = 0;
  session.remoteRatchetPublicKey = receivedRatchetKey;

  session.rootKey = rootResult2.newRootKey;
  session.chainKeyRecv = rootResult1.newChainKey;
  session.ratchetPrivateKey = newPair.privateKey;
  session.ratchetPublicKey = newPair.publicKey;
  session.chainKeySend = rootResult2.newChainKey;
  // NOTE: session.transcriptHash is NOT evolved here.
  // The Signal spec computes transcript hash once during X3DH and keeps it constant.
  // Evolving it here caused initiator/responder encryption key divergence
  // because the initiator's transcriptHash was never evolved to match.
}

// ─────────────────────────────────────────────────────────────────────
// Encrypt / Decrypt
// ─────────────────────────────────────────────────────────────────────

export async function encryptMessage(
  session: SessionState,
  plaintext: Uint8Array,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<EncryptedMessage> {
  const MAX_TTL = 24 * 60 * 60 * 1000;
  const MIN_TTL = 60 * 1000;
  ttlMs = Math.max(MIN_TTL, Math.min(ttlMs, MAX_TTL));

  const { messageKey, nextChainKey } = await kdfChain(session.chainKeySend);
  let encryptionKey: Uint8Array | null = null;
  let nonce: Uint8Array | null = null;

  try {
    const header: Header = {
      version: PROTOCOL_VERSION,
      cipher: CIPHER_SUITE,
      direction: session.isInitiator ? 0x01 : 0x02,
      ratchetPubKey: session.ratchetPublicKey,
      messageNumber: session.sendMessageNumber,
      previousChainLength: session.previousChainLength,
      sessionId: session.sessionId
    };

    // 12-byte nonce: [4-byte random prefix][8-byte BigUint64 counter]
    // P2-01: Use session-level nonce prefix to avoid multi-tab collision
    nonce = new Uint8Array(12);
    nonce.set(session.sessionNoncePrefix, 0);
    view(nonce).setBigUint64(4, BigInt(session.globalSendMessageNumber), false);

    // Key separation: derive encryption key from message key + transcript
    encryptionKey = await hkdf(messageKey, session.transcriptHash, "CipherLink-enc", 32);

    const createdAt = now();
    const expiresAt = createdAt + ttlMs;

    Object.freeze(header);
    const headerBytes = serializeHeader(header);
    if (!(headerBytes instanceof Uint8Array)) throw new Error("Invalid AAD header encoding");
    const aad = buildAAD(headerBytes, createdAt, expiresAt);

    const ciphertext = await aesGcmEncrypt(encryptionKey, nonce, plaintext, aad);

    // Atomic update of session state only after successful encryption
    secureClear(session.chainKeySend);
    session.chainKeySend = nextChainKey;
    session.sendMessageNumber++;
    session.globalSendMessageNumber++;
    session.lastUsedAt = now();

    const msg = { header, ciphertext, nonce, createdAt, expiresAt, ttlMs };
    Object.freeze(msg);
    return msg;
  } catch (err: any) {
    secureClear(nextChainKey);
    throw err;
  } finally {
    secureClear(messageKey);
    if (encryptionKey) secureClear(encryptionKey);
  }
}

function assertNotExpired(expiresAt: number, nowTs: number) {
  const CLOCK_SKEW = 5000; // 5s tolerance
  if (nowTs > expiresAt + CLOCK_SKEW) throw new Error("Message expired");
}

export async function decryptMessage(session: SessionState, message: EncryptedMessage): Promise<Uint8Array> {
  const currentTime = now();
  const MAX_TTL = 24 * 60 * 60 * 1000;

  if (typeof message.createdAt !== "number" || typeof message.expiresAt !== "number") {
    throw new Error("Invalid timestamp types");
  }
  if (!message.expiresAt || !message.createdAt) throw new Error("Missing expiry metadata");
  if (message.createdAt > message.expiresAt) throw new Error("Invalid message timestamps");
  if (message.expiresAt - message.createdAt > MAX_TTL) throw new Error("TTL exceeds allowed bounds");

  assertNotExpired(message.expiresAt, currentTime);
  session.lastUsedAt = currentTime;

  const rawRatchetKey = (message.header as any).ratchetPubKey;
  const parsedHeader = {
    ...message.header,
    // ratchetPubKey arrives in different forms depending on the path:
    //   1. hex string (new format: bytesToHex before JSON)
    //   2. base64 string (legacy format)
    //   3. Uint8Array (in-memory, not serialized)
    //   4. plain numeric object {0:1,...} (old JSON.stringify(Uint8Array) corruption)
    ratchetPubKey: (() => {
      if (rawRatchetKey instanceof Uint8Array) return rawRatchetKey;
      if (typeof rawRatchetKey === 'string') {
        // Hex: exactly 64 lowercase hex chars = 32 bytes
        if (/^[0-9a-fA-F]{64}$/.test(rawRatchetKey)) {
          const bytes = new Uint8Array(32);
          for (let i = 0; i < 32; i++) bytes[i] = parseInt(rawRatchetKey.slice(i * 2, i * 2 + 2), 16);
          return bytes;
        }
        // Base64 fallback
        return fromBase64(rawRatchetKey);
      }
      if (rawRatchetKey && typeof rawRatchetKey === 'object') {
        // Legacy: JSON.stringify(Uint8Array) → {0:1, 1:2, ...}
        const vals = Object.values(rawRatchetKey) as number[];
        return new Uint8Array(vals);
      }
      throw new Error('ratchetPubKey missing or unrecognised format');
    })(),
  };

  if (!(message.nonce instanceof Uint8Array)) throw new Error("Invalid nonce type");
  if (message.nonce.length !== 12) throw new Error("Invalid nonce length");

  // O(1) replay guard (check phase)
  const msgIdBytes = await sha256(concat(message.nonce, new TextEncoder().encode(session.sessionId)));
  const msgId = bytesToBase64(msgIdBytes);
  checkNonce(session, msgId);

  Object.freeze(parsedHeader);

  if (parsedHeader.messageNumber < 0 || parsedHeader.messageNumber > Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid message number");
  }

  // Role-based direction validation
  const expectedDirection = session.isInitiator ? 0x02 : 0x01;
  if (parsedHeader.direction !== expectedDirection) {
    throw new Error("Strict Direction Validation Failed - Invalid message flow direction");
  }

  // DH ratchet step if remote ratchet key changed
  const remoteRatchetB64 = bytesToBase64(session.remoteRatchetPublicKey);
  const msgRatchetB64 = bytesToBase64(parsedHeader.ratchetPubKey);
  if (remoteRatchetB64 === "" || remoteRatchetB64 !== msgRatchetB64) {
    await dhRatchet(session, parsedHeader.ratchetPubKey);
  }

  let messageKey: Uint8Array | null = null;
  let isSkippedMessage = false;
  let tempChainKeyRecv: Uint8Array | null = null;
  let tempRecvMessageNumber: number = session.recvMessageNumber;
  const tempSkippedKeys: { msgNum: number; mk: Uint8Array }[] = [];
  let encryptionKey: Uint8Array | null = null;

  try {
    if (parsedHeader.messageNumber < session.recvMessageNumber) {
      const skippedKey = getSkippedMessageKey(session.skippedMessageKeys, parsedHeader.ratchetPubKey, parsedHeader.messageNumber);
      if (!skippedKey) throw new Error("Message unrecoverable or already processed (Replay Protection)");
      messageKey = skippedKey;
      isSkippedMessage = true;
    } else {
      const MAX_MESSAGE_GAP = 500;
      if (parsedHeader.messageNumber - session.recvMessageNumber > MAX_MESSAGE_GAP) {
        throw new Error("Message gap too large - possible DoS");
      }
      tempChainKeyRecv = session.chainKeyRecv;
      while (tempRecvMessageNumber < parsedHeader.messageNumber) {
        const { messageKey: mk, nextChainKey } = await kdfChain(tempChainKeyRecv);
        tempSkippedKeys.push({ msgNum: tempRecvMessageNumber, mk });
        tempChainKeyRecv = nextChainKey;
        tempRecvMessageNumber++;
      }
      const { messageKey: mk, nextChainKey } = await kdfChain(tempChainKeyRecv);
      messageKey = mk;
      tempChainKeyRecv = nextChainKey;
      tempRecvMessageNumber++;
    }

    encryptionKey = await hkdf(messageKey, session.transcriptHash, "CipherLink-enc", 32);
    const headerBytes = serializeHeader(parsedHeader);
    if (!(headerBytes instanceof Uint8Array)) throw new Error("Invalid AAD header encoding");
    const aad = buildAAD(headerBytes, message.createdAt, message.expiresAt);

    const plaintext = await aesGcmDecrypt(encryptionKey, message.nonce, message.ciphertext, aad);

    const msgGlobalNum = Number(view(message.nonce).getBigUint64(4, false));
    const MAX_FUTURE_DRIFT = 10000;
    if (!isSkippedMessage && msgGlobalNum > session.globalRecvMessageNumber + MAX_FUTURE_DRIFT) {
      throw new Error("Global counter drift too large - possible desync attack");
    }
    if (!isSkippedMessage && msgGlobalNum < session.globalRecvMessageNumber) {
      throw new Error("Global monotonic check failed - replay detected");
    }

    // ATOMIC COMMITS - only executed when encryption successfully finishes
    commitNonce(session, msgId);
    session.globalRecvMessageNumber = Math.max(session.globalRecvMessageNumber, msgGlobalNum + 1);

    if (tempChainKeyRecv) {
      secureClear(session.chainKeyRecv);
      session.chainKeyRecv = tempChainKeyRecv;
      session.recvMessageNumber = tempRecvMessageNumber;
      for (const sk of tempSkippedKeys) {
        storeSkippedMessageKey(session.skippedMessageKeys, session.remoteRatchetPublicKey, sk.msgNum, sk.mk);
      }
      tempSkippedKeys.length = 0; // prevent finally clearing it
      tempChainKeyRecv = null;    // prevent finally clearing it
    }

    session.lastUsedAt = now();
    return plaintext;
  } catch (err: any) {
    // Re-throw preserving original message; finally block clears all sensitive material
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    if (tempChainKeyRecv) secureClear(tempChainKeyRecv);
    for (const sk of tempSkippedKeys) secureClear(sk.mk);
    if (messageKey) secureClear(messageKey);
    if (encryptionKey) secureClear(encryptionKey);
    // NOTE: message.nonce is intentionally NOT cleared here.
    // It belongs to the caller and is only read, never owned, by this function.
    // Zeroing it would silently corrupt the caller's EncryptedMessage object.
  }
}
