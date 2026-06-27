# CipherLink Encryption Architecture

## Two Paths — Never Mix Them

### Path A — Legacy (crypto.ts `encryptMessage`)
Used for: device-linking payloads, identity-verification signatures
Uses: X25519 ECDH → HKDF(sharedSecret, **salt**, info) → AES-256-GCM
The `salt` field in the payload is HKDF input — required for decryption.

### Path B — Double Ratchet (session.ts `encryptRatchet`)  
Used for: all chat messages
Uses: X3DH → Double Ratchet (Signal-compatible)
The `salt` field in the payload is a **placeholder** — the ratchet
derives all keys internally. The field exists only to satisfy the server's
schema validation and MUST NOT be used in decryption logic.
Random bytes are sent (not zeros) to avoid false predictability signals.

## Rule
If you are encrypting a chat message: use `encryptRatchet`.
If you are encrypting a linking payload: use `encryptMessage` (crypto.ts).
Never call one where the other is expected.
