import { createHash } from 'crypto';

/**
 * Generates a deterministic conversation ID for two public keys.
 * Keys are normalized (lowercase, trimmed) before hashing.
 * Matches the SQL logic: sha256(LEAST(a, b) || ':' || GREATEST(a, b))
 */
export function generateConversationId(pubKey1: string, pubKey2: string): string {
  const a = pubKey1.toLowerCase().trim();
  const b = pubKey2.toLowerCase().trim();
  const [least, greatest] = [a, b].sort();
  return createHash('sha256').update(`${least}:${greatest}`).digest('hex');
}
