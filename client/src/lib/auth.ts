import { ed25519 } from '@noble/curves/ed25519.js';
import { getIdentity, getDeviceIdentity } from './storage';
import { hexToBytes, bytesToHex } from './crypto';

async function sha256Hex(input: string): Promise<string> {
    const encoded = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return bytesToHex(new Uint8Array(hash));
}

/** Generate a cryptographically random 32-byte nonce as hex. */
function generateRequestNonce(): string {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return Array.from(b).map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Create signed authentication headers for an API request.
 *
 * Signs: METHOD\nPATH\nSHA256(bodyString)\nTIMESTAMP\nNONCE with Ed25519 device key.
 *
 * DESIGN: The new zero-trust auth middleware requires X-Device-Key on ALL requests.
 * Therefore we ALWAYS sign with the device key if one is available. The device key
 * must be saved locally (via saveDeviceIdentity) before making any authenticated call.
 *
 * Bootstrap sequence:
 *   1. generateEd25519KeyPair()  → save to IDB via saveDeviceIdentity()
 *   2. POST /api/devices/register  → sends X-Device-Key header (this key)
 *   3. Server looks up device in DB and verifies
 *
 * The server's device-register route is the ONE place that accepts a key not yet in
 * the devices table — but it still requires X-Device-Key to be present so the auth
 * middleware can verify format/format at minimum; the route itself verifies the
 * identity signature to establish the key's legitimacy.
 */
export async function createAuthHeaders(
    method: string,
    url: string,
    bodyStr: string = ''
): Promise<Record<string, string>> {
    const deviceIdentity = await getDeviceIdentity();
    const userIdentity = await getIdentity();

    if (!userIdentity) return {};

    // Device key is mandatory for all authenticated requests.
    // If no device key exists yet (edge case: first-ever load before ensureDeviceRegistered runs),
    // we cannot produce valid auth headers — return empty so the caller gets a 401 and triggers
    // the device registration flow rather than silently sending malformed headers.
    if (!deviceIdentity) return {};

    const pathAndParams = url.split(/^\w+:\/\/[^/]+/)[1] || url;
    const timestamp = Date.now().toString();
    const requestNonce = generateRequestNonce();
    const bodyHash = await sha256Hex(bodyStr);

    // Nonce is part of the signed payload — server can't be fooled by stripping it.
    const message = `${method}\n${pathAndParams}\n${bodyHash}\n${timestamp}\n${requestNonce}`;
    const messageBytes = new TextEncoder().encode(message);

    // Always sign with device key — Ed25519 only, never X25519.
    const privateKeyBytes = hexToBytes(deviceIdentity.privateKey);
    const signature = ed25519.sign(messageBytes, privateKeyBytes);

    return {
        'X-Public-Key':     userIdentity.publicKey,
        'X-Device-Key':     deviceIdentity.publicKey,
        'X-Timestamp':      timestamp,
        'X-Signature':      bytesToHex(signature),
        'X-Request-Nonce':  requestNonce,
    };
}


/**
 * Derive the Ed25519 signing public key from the private key seed.
 * Used during registration to store the signing key on the server.
 */
export function getSigningPublicKey(privateKeyHex: string): string {
    return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}

/**
 * Fetch wrapper that automatically adds Ed25519 auth headers.
 * Drop-in replacement for window.fetch() on authenticated endpoints.
 */
export async function authenticatedFetch(
    url: string,
    init?: RequestInit
): Promise<Response> {
    const method = (init?.method || 'GET').toUpperCase();
    const bodyStr = (init?.body && typeof init.body === 'string') ? init.body : '';
    const authHeaders = await createAuthHeaders(method, url, bodyStr);

    const existingHeaders: Record<string, string> = {};
    if (init?.headers) {
        if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => { existingHeaders[k] = v; });
        } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([k, v]) => { existingHeaders[k] = v; });
        } else {
            Object.assign(existingHeaders, init.headers);
        }
    }

    return fetch(url, {
        ...init,
        headers: { ...existingHeaders, ...authHeaders },
    });
}
