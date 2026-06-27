/**
 * Zod validation schemas and helpers for API payload validation.
 * Ensures consistent public keys, friend codes, and cryptographic payload structures.
 */
import { z } from 'zod';

export const publicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid public key format");
export const friendCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, "Invalid friend code format (exactly 8 chars)");
export const ciphertextSchema = z.string().max(100000, "Message too large");
export const nonceSchema = z.string().regex(/^[0-9a-f]{20,48}$/i, "Invalid nonce format");
// Validates the salt field present in ALL encrypted payloads.
// Path A (legacy crypto.ts): salt is HKDF input — required for decryption.
// Path B (Double Ratchet): salt is a random placeholder — NOT used in decryption.
//   The ratchet derives its own keys. The field exists for API shape consistency.
export const saltSchema = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid salt format");
export const ephemeralKeySchema = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid ephemeral public key format");

export const validatePublicKey = (k: string): boolean => publicKeySchema.safeParse(k).success;
export const validateFriendCode = (c: string): boolean => friendCodeSchema.safeParse(c).success;
export const validateCiphertext = (t: string): boolean => ciphertextSchema.safeParse(t).success;
