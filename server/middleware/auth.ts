import { ed25519 } from '@noble/curves/ed25519.js';
import { createHash, randomInt } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { logSecurityEvent } from '../logger/security';
import type { User } from '@shared/schema';
import { db } from '../db';
import { authNonces } from '@shared/schema';

// Extend Express Request with authenticated public key
declare global {
    namespace Express {
        interface Request {
            authPublicKey?: string;
        }
    }
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * SEC-FIX: Timing attack protection
 */
async function verifySignatureWithJitter(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
): Promise<boolean> {
    const startTime = Date.now();
    const isValid = ed25519.verify(signature, message, publicKey);
    const jitter = randomInt(0, 50);
    const elapsed = Date.now() - startTime;
    const targetTime = 30;
    if (elapsed < targetTime) {
        await new Promise(resolve =>
            setTimeout(resolve, targetTime - elapsed + jitter)
        );
    } else {
        await new Promise(resolve => setTimeout(resolve, jitter));
    }
    return isValid;
}

/**
 * SEC-FIX: Constant-time user lookup
 */
async function getUserConstantTime(publicKey: string): Promise<User | undefined> {
    const startTime = Date.now();
    const user = await storage.getUser(publicKey);
    const elapsed = Date.now() - startTime;
    const targetTime = 10;
    if (elapsed < targetTime) {
        await new Promise(resolve =>
            setTimeout(resolve, targetTime - elapsed + randomInt(0, 5))
        );
    }
    return user;
}

/**
 * SEC-07: Auth nonce replay protection.
 * Stores the nonce in the DB with a 5-min TTL; rejects duplicates atomically.
 * Falls back gracefully if DB is unavailable (to prevent auth bypass).
 */
async function consumeAuthNonce(nonce: string, publicKey: string): Promise<boolean> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    try {
        // Insert nonce — unique constraint rejects duplicates atomically
        // Expired nonce cleanup is handled by the cleanup job (cleanup.ts, every 60s)
        await db.insert(authNonces).values({ nonce, publicKey, expiresAt });
        return true; // new nonce, allow
    } catch (err: any) {
        // SEC-FIX: Only treat unique-constraint violations as genuine replay attempts.
        // All other errors (timeouts, pool exhaustion, etc.) are infrastructure failures
        // that MUST be re-thrown so the caller can return 500, not a false 401.
        const isUniqueViolation =
            err?.code === '23505' ||
            err?.message?.toLowerCase().includes('unique') ||
            err?.message?.toLowerCase().includes('duplicate key');
        if (isUniqueViolation) return false; // genuine replay — reject
        throw err;                           // infra error — caller returns 500
    }
}

/**
 * Stateless cryptographic authentication middleware — zero-trust, device-centric.
 *
 * Required headers (ALL requests):
 *   X-Public-Key    — X25519 account identifier (hex, 64 chars)
 *   X-Timestamp     — Unix ms timestamp
 *   X-Device-Key    — Ed25519 device signing key (hex, 64 chars)
 *   X-Signature     — Ed25519 signature over: METHOD\nPATH\nSHA256(body)\nTIMESTAMP\nNONCE
 *   X-Request-Nonce — Random per-request nonce (hex, 64 chars)
 *
 * Security model:
 *   - Ed25519 is ONLY used for signatures (device keys)
 *   - X25519 is ONLY used as the account identifier (never for sig verification)
 *   - EVERY request must carry X-Device-Key — no silent fallbacks
 *   - Migration path: if user.devicePublicKey is NULL, the device must already
 *     exist in the devices table (verified bootstrap, NOT a cryptographic fallback)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    // ── 1. Extract and validate all required headers ───────────────────────
    const publicKey    = req.headers['x-public-key']     as string;
    const timestamp    = req.headers['x-timestamp']      as string;
    const signature    = req.headers['x-signature']      as string;
    const requestNonce = req.headers['x-request-nonce']  as string;
    const deviceKeyRaw = req.headers['x-device-key']     as string;

    if (!publicKey || !timestamp || !signature) {
        return res.status(401).json({ error: 'Missing authentication headers' });
    }

    // X-Device-Key is mandatory for ALL requests — no exceptions, no legacy fallbacks.
    if (!deviceKeyRaw) {
        return res.status(401).json({ error: 'Missing X-Device-Key header: all requests require a registered device key' });
    }

    // Validate nonce: exactly 64 hex chars (32 bytes)
    if (!requestNonce || !/^[0-9a-f]{64}$/i.test(requestNonce)) {
        return res.status(401).json({ error: 'Invalid X-Request-Nonce: must be exactly 64 hex characters' });
    }

    // Validate public key format (X25519 account identifier)
    if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
        return res.status(401).json({ error: 'Invalid public key format' });
    }

    // Validate device key format (Ed25519 signing key)
    if (!/^[0-9a-f]{64}$/i.test(deviceKeyRaw)) {
        return res.status(401).json({ error: 'Invalid device key format' });
    }

    // Validate signature format (Ed25519 signature = 64 bytes = 128 hex)
    if (!/^[0-9a-f]{128}$/i.test(signature)) {
        return res.status(401).json({ error: 'Invalid signature format' });
    }

    const normalizedKey       = publicKey.toLowerCase().trim();
    const normalizedDeviceKey = deviceKeyRaw.toLowerCase().trim();

    // Timestamp must be within ±5 minutes
    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    if (isNaN(reqTime) || reqTime <= 0 || Math.abs(now - reqTime) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Request expired' });
    }

    // ── 2. All DB and infra operations — distinguished from auth failures ──
    try {
        // ── 2a. Fetch user record ──────────────────────────────────────────
        const user = await getUserConstantTime(normalizedKey);
        if (!user) {
            logSecurityEvent({
                type: 'auth_failure',
                publicKey: normalizedKey,
                ip: req.ip || 'unknown',
                userAgent: req.headers['user-agent'],
                details: { reason: 'user_not_found' },
            });
            return res.status(401).json({ error: 'Unknown identity' });
        }

        // ── 2b. Device verification — source of truth is the devices table ─
        const device = await storage.getDeviceByPublicKey(normalizedDeviceKey);
        if (!device || device.userPublicKey !== normalizedKey) {
            logSecurityEvent({
                type: 'auth_failure',
                publicKey: normalizedKey,
                ip: req.ip || 'unknown',
                details: { reason: 'unknown_device', deviceKey: normalizedDeviceKey.slice(0, 16) },
            });
            return res.status(401).json({ error: 'Unknown device: register this device first' });
        }

        if (device.revoked) {
            logSecurityEvent({
                type: 'auth_failure',
                publicKey: normalizedKey,
                ip: req.ip || 'unknown',
                details: { reason: 'revoked_device', deviceKey: normalizedDeviceKey.slice(0, 16) },
            });
            return res.status(401).json({ error: 'Device has been revoked' });
        }

        // ── 2c. Verify Ed25519 signature against the device key ────────────
        // ORDERING CRITICAL: Migration back-fill (2d) must run AFTER signature
        // verification. Running it before allows an attacker with a victim's
        // X-Public-Key (non-secret) to poison the victim's devicePublicKey field
        // by sending any X-Device-Key before the sig check rejects them.
        const rawBody  = req.rawBody;
        const bodyStr  = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : '';
        const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
        const message  = `${req.method}\n${req.originalUrl}\n${bodyHash}\n${timestamp}\n${requestNonce}`;

        const sigBytes     = hexToBytes(signature);
        const messageBytes = new TextEncoder().encode(message);
        const deviceBytes  = hexToBytes(normalizedDeviceKey);

        const valid = await verifySignatureWithJitter(sigBytes, messageBytes, deviceBytes);

        if (!valid) {
            logSecurityEvent({
                type: 'auth_failure',
                publicKey: normalizedKey,
                ip: req.ip || 'unknown',
                userAgent: req.headers['user-agent'],
                details: { reason: 'invalid_signature', deviceKey: normalizedDeviceKey.slice(0, 16) },
            });
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // ── 2d. Replay protection: consume nonce AFTER signature verified ──
        // Consuming before sig verification would allow nonce-burning DoS attacks.
        // MED-1 FIX: Prefix with 'auth:' to namespace-separate from bootstrap nonces.
        const nonceKey = `auth:${normalizedKey}:${requestNonce}`;
        let nonceOk: boolean;
        try {
            nonceOk = await consumeAuthNonce(nonceKey, normalizedKey);
        } catch (nonceErr) {
            // Infrastructure error — NOT a replay. Must return 500.
            if (process.env.NODE_ENV !== 'production') {
                console.error('[Auth] Nonce storage error (infra — not a replay):', nonceErr);
            }
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!nonceOk) {
            logSecurityEvent({
                type: 'replay_attempt',
                publicKey: normalizedKey,
                ip: req.ip || 'unknown',
                details: { reason: 'duplicate_auth_nonce', nonce: requestNonce.slice(0, 16) },
            });
            return res.status(401).json({ error: 'Duplicate request nonce (replay rejected)' });
        }

        // ── 2e. MIGRATION: back-fill user.devicePublicKey for legacy accounts ──
        // HIGH-1 FIX: This must run AFTER both signature verification AND nonce
        // consumption. Prior ordering allowed an attacker with the victim's X25519
        // public key to poison user.devicePublicKey before the sig check rejected them.
        // Idempotent: setUserDevicePublicKey is a no-op if key is already set.
        if (!user.devicePublicKey) {
            await storage.setUserDevicePublicKey(normalizedKey, normalizedDeviceKey);
        }

        req.authPublicKey = normalizedKey;
        next();

    } catch (error) {
        // Genuine infrastructure failure — distinguish from auth failure.
        // Do NOT return 401 here; that would falsely imply a bad credential.
        if (process.env.NODE_ENV !== 'production') {
            console.error('[Auth] Infrastructure error:', error);
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Bootstrap auth middleware — used ONLY for POST /api/devices/register.
 *
 * A brand-new device key cannot be in the devices table yet, so requireAuth
 * would always reject the registration call. This middleware verifies everything
 * that is knowable at registration time:
 *   ✅ Headers present & format correct
 *   ✅ Timestamp within window
 *   ✅ User account exists
 *   ✅ Ed25519 signature over standard message payload using X-Device-Key
 *   ✅ Nonce consumed (replay protection)
 *
 * The route itself then performs the definitive trust check:
 *   ✅ identity_signature: Ed25519 sign(devicePublicKey) with user's signing key
 *
 * This is NOT a security downgrade — the route's identity-signature check is
 * equivalent to a TOFU proof that the requester controls the account's signing key.
 */
export async function requireAuthBootstrap(req: Request, res: Response, next: NextFunction) {
    const publicKey    = req.headers['x-public-key']    as string;
    const timestamp    = req.headers['x-timestamp']     as string;
    const signature    = req.headers['x-signature']     as string;
    const requestNonce = req.headers['x-request-nonce'] as string;
    const deviceKeyRaw = req.headers['x-device-key']    as string;

    if (!publicKey || !timestamp || !signature || !deviceKeyRaw) {
        return res.status(401).json({ error: 'Missing authentication headers' });
    }
    if (!requestNonce || !/^[0-9a-f]{64}$/i.test(requestNonce)) {
        return res.status(401).json({ error: 'Invalid X-Request-Nonce: must be exactly 64 hex characters' });
    }
    if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
        return res.status(401).json({ error: 'Invalid public key format' });
    }
    if (!/^[0-9a-f]{64}$/i.test(deviceKeyRaw)) {
        return res.status(401).json({ error: 'Invalid device key format' });
    }
    if (!/^[0-9a-f]{128}$/i.test(signature)) {
        return res.status(401).json({ error: 'Invalid signature format' });
    }

    const normalizedKey       = publicKey.toLowerCase().trim();
    const normalizedDeviceKey = deviceKeyRaw.toLowerCase().trim();

    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    if (isNaN(reqTime) || reqTime <= 0 || Math.abs(now - reqTime) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Request expired' });
    }

    try {
        const user = await getUserConstantTime(normalizedKey);
        if (!user) {
            logSecurityEvent({ type: 'auth_failure', publicKey: normalizedKey, ip: req.ip || 'unknown', details: { reason: 'user_not_found_bootstrap' } });
            return res.status(401).json({ error: 'Unknown identity' });
        }

        const rawBody  = req.rawBody;
        const bodyStr  = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : '';
        const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
        const message  = `${req.method}\n${req.originalUrl}\n${bodyHash}\n${timestamp}\n${requestNonce}`;

        const sigBytes     = hexToBytes(signature);
        const messageBytes = new TextEncoder().encode(message);
        const deviceBytes  = hexToBytes(normalizedDeviceKey);

        const valid = await verifySignatureWithJitter(sigBytes, messageBytes, deviceBytes);
        if (!valid) {
            logSecurityEvent({ type: 'auth_failure', publicKey: normalizedKey, ip: req.ip || 'unknown', details: { reason: 'invalid_signature_bootstrap', deviceKey: normalizedDeviceKey.slice(0, 16) } });
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // MED-1 FIX: Prefix with 'bootstrap:' to namespace-separate from regular auth nonces.
        const nonceKey = `bootstrap:${normalizedKey}:${requestNonce}`;
        let nonceOk: boolean;
        try {
            nonceOk = await consumeAuthNonce(nonceKey, normalizedKey);
        } catch (nonceErr) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('[Auth Bootstrap] Nonce storage error:', nonceErr);
            }
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (!nonceOk) {
            logSecurityEvent({ type: 'replay_attempt', publicKey: normalizedKey, ip: req.ip || 'unknown', details: { reason: 'duplicate_nonce_bootstrap' } });
            return res.status(401).json({ error: 'Duplicate request nonce (replay rejected)' });
        }

        req.authPublicKey = normalizedKey;
        next();

    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[Auth Bootstrap] Infrastructure error:', error);
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}
