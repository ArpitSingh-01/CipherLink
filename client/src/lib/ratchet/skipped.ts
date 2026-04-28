import { bytesToBase64, secureClear } from './crypto-helpers.js';

export const MAX_SKIP = 1000;
export const MAX_SKIP_AGE_MS = 1000 * 60 * 60 * 24; // 24 hours

export interface SkippedKey {
  key: Uint8Array;
  timestamp: number;
}

// The original getSkippedMessageKeyStr is no longer used and is implicitly removed by the new functions.
// function getSkippedMessageKeyStr(ratchetPubKey: Uint8Array, messageNumber: number): string {
//   // Use key: `${ratchetPubKey}:${messageNumber}`
//   return `${bytesToBase64(ratchetPubKey)}:${messageNumber}`;
// }

export const MAX_SKIP_PER_EPOCH = 200;

export function storeSkippedMessageKey(
  skippedKeys: Map<string, SkippedKey>,
  ratchetPubKey: Uint8Array,
  messageNumber: number,
  messageKey: Uint8Array
) {
  // RT-04: Prevent cache flood by malicious peers repeatedly triggering DH ratchets
  // followed by large message gaps. Cap each ratchet pub key epoch to a specific limit.
  const prefix = bytesToBase64(ratchetPubKey) + '-';
  let epochCount = 0;
  const keysArray = Array.from(skippedKeys.keys());
  for (let i = 0; i < keysArray.length; i++) {
    if (keysArray[i].startsWith(prefix)) epochCount++;
  }
  
  if (epochCount >= MAX_SKIP_PER_EPOCH) {
    // Drop the new skipped key to prevent single-epoch flooding from evicting 
    // valid skipped keys from other epochs or other valid sessions.
    secureClear(messageKey);
    return;
  }

  if (skippedKeys.size >= MAX_SKIP) {
    // O(1) Eviction: Map preserves insertion order, so the first key is the oldest.
    const oldestKeyStr = skippedKeys.keys().next().value;
    if (oldestKeyStr !== undefined) {
      const oldKey = skippedKeys.get(oldestKeyStr);
      if (oldKey) secureClear(oldKey.key); // Securely clear the key before eviction
      skippedKeys.delete(oldestKeyStr);
    }
  }
  const keyString = prefix + messageNumber;
  skippedKeys.set(keyString, { key: messageKey, timestamp: Date.now() });
}

export function getSkippedMessageKey(
  skippedKeys: Map<string, SkippedKey>,
  ratchetPubKey: Uint8Array,
  messageNumber: number
): Uint8Array | null {
  const keyString = bytesToBase64(ratchetPubKey) + '-' + messageNumber;
  const entry = skippedKeys.get(keyString);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > MAX_SKIP_AGE_MS) {
    secureClear(entry.key); // Securely clear the key if it's too old
    skippedKeys.delete(keyString);
    return null;
  }
  
  skippedKeys.delete(keyString);
  return entry.key;
}
