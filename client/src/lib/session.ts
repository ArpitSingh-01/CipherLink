import {
  initSession as arInit,
  encryptMessage as arEncrypt,
  decryptMessage as arDecrypt,
  serializeSessionState,
  deserializeSessionState,
  setPersistentHooks
} from './ratchet/ratchet';
export { setPersistentHooks };
import { SessionState as ARSessionState, EncryptedMessage } from './ratchet/types';
import { getRatchetSession, saveRatchetSession, getDB } from './storage';
import { bytesToHex, hexToBytes } from './crypto';
import { generateRatchetKeyPair, secureClear } from './ratchet/crypto-helpers';

export type SessionState = ARSessionState;

export function getSessionId(localPub: Uint8Array, remotePub: Uint8Array): string {
  const localHex = bytesToHex(localPub);
  const remoteHex = bytesToHex(remotePub);
  return [localHex, remoteHex].sort().join(':');
}

export async function loadSession(localPub: Uint8Array, remotePub: Uint8Array): Promise<SessionState | undefined> {
  const sessionId = getSessionId(localPub, remotePub);
  const stored = await getRatchetSession(sessionId);
  if (stored) {
    return deserializeSessionState(stored);
  }
  return undefined;
}

export async function initSession(
  localIdentityKeyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
  remoteDevicePublicKey: Uint8Array,
  remoteIdentityPub: Uint8Array,
  remotePreKeySignature?: Uint8Array | null,
  senderEphemeralPub?: Uint8Array
): Promise<{ session: SessionState; ephemeralPublicKey?: Uint8Array }> {
  // CURVE FIX: X3DH DH operations require X25519 keys on BOTH sides.
  //
  // Identity keys (X25519) are used for IKa/IKb in X3DH.
  // Device keys (Ed25519) are used only for signing/authentication.
  //
  // CRITICAL: SPKb (the signed prekey) MUST also be an X25519 key.
  // We set SPKb = IKb (remoteIdentityPub) since this system does not
  // publish separate X25519 prekeys per device. This is a valid X3DH
  // simplification: both sides use the same X25519 key for IKb and SPKb.
  //
  // DH commutativity property (requires Curve25519 on both sides):
  //   DH(IKa_priv, SPKb_pub) = DH(SPKb_priv, IKa_pub)
  //   Only holds when IKa and SPKb are both X25519 keys.

  let session: SessionState;
  let ephemeralPair: { privateKey: Uint8Array; publicKey: Uint8Array } | null = null;

  try {
    if (!senderEphemeralPub) {
      // INITIATOR path
      ephemeralPair = generateRatchetKeyPair();  // Fresh X25519 ephemeral EKa
      session = await arInit(
        localIdentityKeyPair.privateKey,  // IKa_priv — X25519 identity private key
        localIdentityKeyPair.publicKey,   // IKa_pub  — X25519 identity public key
        ephemeralPair.privateKey,         // EKa_priv — fresh X25519 ephemeral
        ephemeralPair.publicKey,          // EKa_pub  — fresh X25519 ephemeral
        remoteIdentityPub,                // IKb_pub  — remote X25519 identity key
        remoteIdentityPub,                // SPKb     — MUST be X25519; use IKb (SPKb=IKb)
        null,                             // preKeySignature — skipped (SPKb=IKb is self-evident)
        null,                             // remoteIdentitySignPub — no separate Ed25519 check here
        localIdentityKeyPair.publicKey,   // localDevicePublicKey (session storage key)
        remoteDevicePublicKey,            // remoteDevicePublicKey (session storage key)
        undefined,                        // senderEphemeralPub — initiator generates, does not receive
        true                              // explicitIsInitiator — we are the initiator
      );
    } else {
      // RESPONDER path
      // Since SPKb = IKb (our X3DH simplification), SPKb_priv = IKb_priv = localIdentityKeyPair.privateKey.
      // The ratchet responder ACTIVELY uses localEphemeralPriv for:
      //   RDH1 = DH(localEphemeralPriv, IKa_pub)   [= DH(SPKb_priv, IKa_pub)]
      //   RDH3 = DH(localEphemeralPriv, EKa_pub)   [= DH(SPKb_priv, EKa_pub)]
      // Passing zeros here makes RDH1 ≠ initiator's DH1 → shared secret diverges.
      session = await arInit(
        localIdentityKeyPair.privateKey,  // IKb_priv — X25519 identity private key
        localIdentityKeyPair.publicKey,   // IKb_pub  — X25519 identity public key
        localIdentityKeyPair.privateKey,  // SPKb_priv = IKb_priv (SPKb=IKb simplification)
        localIdentityKeyPair.publicKey,   // SPKb_pub  = IKb_pub
        remoteIdentityPub,                // IKa_pub  — remote X25519 identity key
        // TRANSCRIPT FIX: preKeyForHash must = IKb_pub on BOTH sides.
        // Initiator passes remoteIdentityPub (IKb) as SPKb → preKeyForHash = IKb.
        // Responder IS the SPKb holder (IKb = their local key), so pass localIdentityKeyPair.publicKey.
        localIdentityKeyPair.publicKey,   // remotePreKey = IKb_pub (local key) → preKeyForHash = IKb ✓
        null,                             // preKeySignature — skipped
        null,                             // remoteIdentitySignPub — no separate Ed25519 check
        localIdentityKeyPair.publicKey,   // localDevicePublicKey (session storage key)
        remoteDevicePublicKey,            // remoteDevicePublicKey (session storage key)
        senderEphemeralPub,               // EKa_pub from the initiator's payload
        false                             // explicitIsInitiator=false — we are the RESPONDER
      );
    }

    // Session is keyed by [localIdentityPub, remoteDeviceKey] (sorted).
    // loadSession callers must use the same pair.
    const sessionId = getSessionId(localIdentityKeyPair.publicKey, remoteDevicePublicKey);
    await saveRatchetSession(sessionId, serializeSessionState(session));
    return { session, ephemeralPublicKey: ephemeralPair?.publicKey };
  } finally {
    // Zeroize ephemeral private key immediately after use — it must not persist
    if (ephemeralPair) {
      secureClear(ephemeralPair.privateKey);
    }
  }
}

export async function encryptRatchet(
  session: SessionState,
  plaintext: string
): Promise<{ ciphertext: string; nonce: string; messageNumber: number; raw: EncryptedMessage }> {
  const enc = await arEncrypt(session, new TextEncoder().encode(plaintext));
  const sessionId = getSessionId(session.localDevicePublicKey, session.remoteDevicePublicKey);
  await saveRatchetSession(sessionId, serializeSessionState(session));

  return {
    ciphertext: bytesToHex(enc.ciphertext),
    nonce: bytesToHex(enc.nonce),
    messageNumber: enc.header.messageNumber,
    raw: enc
  };
}

export async function decryptRatchet(
  session: SessionState,
  encryptedData: any
): Promise<string> {
  const dec = await arDecrypt(session, encryptedData);
  const sessionId = getSessionId(session.localDevicePublicKey, session.remoteDevicePublicKey);
  await saveRatchetSession(sessionId, serializeSessionState(session));
  return new TextDecoder().decode(dec);
}

