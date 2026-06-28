# CipherLink Encryption Architecture

CipherLink is designed as a zero-identity-trace, forward-secure chat platform. Security is enforced client-side and verified cryptographically on the server.

## 1. Key Derivation & Storage Security

### Device Identity Key (Ed25519)
- **Generation:** Generated client-side.
- **Storage:** Stored locally in IndexedDB.
- **Encryption at Rest:** To prevent extraction attacks, the private key is encrypted with AES-GCM-256. The encryption key is derived from the user's PIN using PBKDF2-HMAC-SHA256 with **100,000 iterations** and a **unique 16-byte random salt** stored alongside the encrypted key.
- **Lockout:** Encrypted in-memory decryption ensures keys are cleared immediately when the session ends or if too many incorrect PIN attempts occur (locked out for 30s).

---

## 2. Server Authentication Hardening

Every mutating endpoint (`POST`, `DELETE`, etc.) requires a cryptographic proof of identity:
- **X-Signature:** A base64-encoded signature of the request payload (URI path, timestamp, and request body) signed with the user's Ed25519 private key.
- **X-Public-Key:** The user's Curve25519 public key.
- **Verification:** The server validates the signature cryptographically before acting. Users do not sign up with passwords or emails; public keys *are* their identities.

---

## 3. Communication Protocols (Never Mixed)

### Path A: Device Linking & Verification
- **Purpose:** Used for device-to-device transfers (transmitting recovery phrases to new devices) and identity safety number signatures.
- **Protocol:** X25519 ECDH exchange -> HKDF derivation (using a payload-specific random salt and info string) -> AES-256-GCM.
- **Requirement:** The salt used in HKDF is passed in the payload and is mandatory for decryption.

### Path B: Chat Messaging (Double Ratchet)
- **Purpose:** Used for all peer-to-peer chat text.
- **Protocol:** X3DH key agreement establishes initial root and chain keys, followed by the Signal-compatible **Double Ratchet** protocol.
- **Optimized Payload:** The placeholder `salt` field has been **completely eliminated** from the schema and payload. All ratcheted keys are derived internally using KDF chains, keeping the payload payload-size optimal with zero redundant bytes.
