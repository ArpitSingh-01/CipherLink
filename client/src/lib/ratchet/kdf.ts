import { hkdf, hmac } from './crypto-helpers.js';

export async function kdfChain(chainKey: Uint8Array): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
  const msgInput = new Uint8Array([0x01]);
  const nextInput = new Uint8Array([0x02]);
  
  const messageKey = await hmac(chainKey, msgInput);
  const nextChainKey = await hmac(chainKey, nextInput);
  
  return { messageKey, nextChainKey };
}

export async function kdfRoot(rootKey: Uint8Array, dhOutput: Uint8Array, infoLabel: string): Promise<{ newRootKey: Uint8Array; newChainKey: Uint8Array }> {
  // Use rootKey as salt according to standard DH Ratchet.
  // The strict domain seperation infoLabel will be "CipherLink-DHRatchet" or "CipherLink-RootKDF"
  const derived = await hkdf(dhOutput, rootKey, infoLabel, 64);
  
  return {
    newRootKey: derived.slice(0, 32),
    newChainKey: derived.slice(32, 64)
  };
}
