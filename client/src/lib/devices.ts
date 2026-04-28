import { generateEd25519KeyPair, getDeviceName } from './crypto';
import { getDeviceIdentity, saveDeviceIdentity, getIdentity, getDB } from './storage';
import { authenticatedFetch } from './auth';

import { ed25519 } from '@noble/curves/ed25519.js';

/**
 * Ensures the device is registered with the backend.
 * 
 * 1. Checks if a device key exists locally.
 * 2. If not, generates a new one.
 * 3. Registers the device public key with the backend.
 */
export async function ensureDeviceRegistered(): Promise<void> {
    const identity = await getIdentity();
    if (!identity) {
        // Cannot register a device without a user identity
        return;
    }

    let deviceIdentity = await getDeviceIdentity();

    if (!deviceIdentity) {
        console.log('No device identity found. Generating new key pair...');
        const keyPair = generateEd25519KeyPair();
        const deviceName = getDeviceName();

        // Save locally first
        await saveDeviceIdentity(keyPair.publicKey, keyPair.privateKey, deviceName);
        
        // Refresh local variable
        deviceIdentity = await getDeviceIdentity();
    }

    // Idempotency guard: skip registration if already completed for this device key.
    // Prevents duplicate attempts from React StrictMode re-mounts and hot-reloads.
    if (deviceIdentity) {
        try {
            const idb = await getDB();
            const regFlagKey = `device_registered_${deviceIdentity.publicKey}`;
            const alreadyRegistered = await idb.get('settings', regFlagKey);
            if (alreadyRegistered === 'true') {
                return; // already registered — skip
            }

            // TOFU first-device: self-signed with the device's OWN Ed25519 private key.
            // Server verifies: ed25519.verify(sig, devicePublicKey, devicePublicKey)
            // DO NOT use identity.privateKey here — that is an X25519 key and cannot
            // produce Ed25519 signatures. The device private key is the correct signing key.
            const messageObj = new TextEncoder().encode(deviceIdentity.publicKey);
            const privateDevKey = new Uint8Array(deviceIdentity.privateKey.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
            const sigBytes = ed25519.sign(messageObj, privateDevKey);
            const identitySignatureHex = Array.from(sigBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');

            const response = await authenticatedFetch('/api/devices/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    device_public_key: deviceIdentity.publicKey,
                    device_name: deviceIdentity.deviceName,
                    identity_signature: identitySignatureHex
                }),
            });

            if (response.ok) {
                // Persist flag so future mounts skip this call
                await idb.put('settings', 'true', regFlagKey);
                console.log('Device registered successfully');
            } else if (response.status === 409) {
                // Already on the server — set local flag to prevent redundant future calls
                await idb.put('settings', 'true', regFlagKey);
            } else {
                const errorText = await response.text();
                console.error('Failed to register device:', errorText);
            }
        } catch (error) {
            console.error('Error during device registration:', error);
        }
    }
}

/**
 * Fetches the list of active devices for the current user.
 */
export async function getActiveDevices(): Promise<any[]> {
    const response = await authenticatedFetch('/api/devices');
    if (!response.ok) {
        throw new Error('Failed to fetch devices');
    }
    return response.json();
}

/**
 * Revokes a device by its public key.
 * Throws if the server rejects the request so callers know the revocation failed.
 */
export async function revokeDevice(devicePublicKey: string): Promise<void> {
    const response = await authenticatedFetch('/api/devices/revoke', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_public_key: devicePublicKey }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to revoke device: ${error}`);
    }
}

// ==================== NEW DEVICE DETECTION (SEC-DEVICE-01) ====================

const SEEN_DEVICES_SETTINGS_KEY = 'seen_device_keys';

/**
 * Detect any new (previously unseen) devices registered for the current account.
 * 
 * Compares the server's active device list against the locally-stored set of
 * acknowledged device public keys. Returns only new devices the user hasn't
 * confirmed yet.  Call `acknowledgeDevices` after the user reviews them.
 *
 * @returns Array of device objects for new, unacknowledged devices.
 */
export async function detectNewDevices(): Promise<any[]> {
    const activeDevices = await getActiveDevices();
    const db = await getDB();
    const seenRaw = await db.get('settings', SEEN_DEVICES_SETTINGS_KEY);
    const seenKeys: Set<string> = seenRaw
        ? new Set(JSON.parse(seenRaw as string))
        : new Set();

    return activeDevices.filter(device => !seenKeys.has(device.devicePublicKey));
}

/**
 * Mark a list of device public keys as acknowledged ("seen").
 * After calling this, `detectNewDevices` will no longer return these keys.
 */
export async function acknowledgeDevices(devicePublicKeys: string[]): Promise<void> {
    const db = await getDB();
    const seenRaw = await db.get('settings', SEEN_DEVICES_SETTINGS_KEY);
    const seenKeys: Set<string> = seenRaw
        ? new Set(JSON.parse(seenRaw as string))
        : new Set();

    for (const key of devicePublicKeys) {
        seenKeys.add(key);
    }

    await db.put('settings', JSON.stringify(Array.from(seenKeys)), SEEN_DEVICES_SETTINGS_KEY);
}
