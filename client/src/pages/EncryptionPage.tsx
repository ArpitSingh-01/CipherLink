// client/src/pages/EncryptionPage.tsx
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { Shield, Key, Lock, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FAQ_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is end-to-end encryption?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "End-to-end encryption (E2EE) means that messages are encrypted on the sender's device and can only be decrypted by the intended recipient. No server, ISP, or third party — not even the app developer — can read the message content. CipherLink implements E2EE using the Signal Protocol."
      }
    },
    {
      "@type": "Question",
      "name": "What is the Signal Protocol?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The Signal Protocol is a cryptographic protocol that combines X3DH (Extended Triple Diffie-Hellman) key agreement with the Double Ratchet Algorithm to provide end-to-end encryption with forward secrecy and break-in recovery. It is the same protocol used by Signal, WhatsApp, and Google Messages."
      }
    },
    {
      "@type": "Question",
      "name": "What is the Double Ratchet Algorithm?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The Double Ratchet Algorithm provides forward secrecy by using a new encryption key for every single message. It combines a symmetric-key ratchet (for each message) and a Diffie-Hellman ratchet (when new keys are exchanged). If an attacker compromises one message key, they cannot decrypt any other messages."
      }
    },
    {
      "@type": "Question",
      "name": "What is X3DH (Extended Triple Diffie-Hellman)?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "X3DH is a key agreement protocol that allows two parties to establish a shared secret even when one party is offline. It uses three Diffie-Hellman calculations involving long-term identity keys and ephemeral keys to produce a shared secret that neither party ever transmits directly."
      }
    },
    {
      "@type": "Question",
      "name": "Does CipherLink store my messages?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "CipherLink's server only stores encrypted ciphertext — it never has access to your private keys or plaintext messages. Messages can also be set to auto-delete (ephemeral mode). The server sees only encrypted blobs and cannot derive any information about message content."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need a phone number or email to use CipherLink?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. CipherLink does not require a phone number, email address, or any personal identifier. Your identity is a cryptographic key pair generated locally in your browser. The public key is your address; the private key never leaves your device."
      }
    }
  ]
};

const ARTICLE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "How CipherLink Encryption Works: Signal Protocol, X3DH, and Double Ratchet Explained",
  "description": "A comprehensive technical explanation of how CipherLink implements end-to-end encryption using the Signal Protocol, X3DH key agreement, Double Ratchet Algorithm, and AES-256-GCM.",
  "url": "https://cipher-link-alpha.vercel.app/encryption",
  "datePublished": "2025-01-01",
  "dateModified": "2026-06-29",
  "author": { "@type": "Person", "name": "Arpit Singh" },
  "publisher": { "@type": "Organization", "name": "CipherLink" },
  "keywords": "end-to-end encryption, Signal Protocol, X3DH, Double Ratchet, AES-256-GCM, forward secrecy",
  "articleSection": "Security & Cryptography"
};

export default function EncryptionPage() {
  useSEO({
    title: 'How CipherLink Encryption Works — Signal Protocol, X3DH & Double Ratchet',
    description: 'Technical deep-dive into CipherLink\'s encryption: Signal Protocol implementation with X3DH key agreement, Double Ratchet algorithm, AES-256-GCM, and Ed25519 authentication. No phone number required.',
    keywords: 'signal protocol, x3dh, double ratchet, end-to-end encryption, forward secrecy, aes-256-gcm, ed25519',
    canonicalUrl: 'https://cipher-link-alpha.vercel.app/encryption',
    structuredData: { "@graph": [FAQ_STRUCTURED_DATA, ARTICLE_STRUCTURED_DATA] },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav bar — simple, consistent with landing page */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <Link href="/">
          <a className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            CipherLink
          </a>
        </Link>
        <Link href="/onboarding">
          <Button size="sm">Get Started</Button>
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-primary border border-primary/20 bg-primary/5 rounded-full px-3 py-1 mb-6">
            <Lock className="w-3 h-3" />
            Technical Documentation
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            How CipherLink Encryption Works
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-3xl">
            CipherLink implements the Signal Protocol — the same cryptographic standard
            used by Signal, WhatsApp, and Google Messages. This document explains every
            layer of encryption, from key generation to message delivery.
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="mb-16 p-6 bg-card border border-border rounded-xl" aria-label="Table of contents">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            On this page
          </h2>
          <ol className="space-y-2 text-sm">
            <li><a href="#identity" className="text-primary hover:underline">1. Cryptographic Identity (No Account Required)</a></li>
            <li><a href="#x3dh" className="text-primary hover:underline">2. X3DH Key Agreement — Establishing a Shared Secret</a></li>
            <li><a href="#double-ratchet" className="text-primary hover:underline">3. Double Ratchet Algorithm — Per-Message Forward Secrecy</a></li>
            <li><a href="#aes-gcm" className="text-primary hover:underline">4. AES-256-GCM — Message Encryption</a></li>
            <li><a href="#server-auth" className="text-primary hover:underline">5. Ed25519 Server Authentication</a></li>
            <li><a href="#key-storage" className="text-primary hover:underline">6. Key Storage & PIN Protection</a></li>
            <li><a href="#ephemeral" className="text-primary hover:underline">7. Ephemeral Messages & Message Expiry</a></li>
            <li><a href="#faq" className="text-primary hover:underline">8. Frequently Asked Questions</a></li>
          </ol>
        </nav>

        {/* Section 1: Identity */}
        <section id="identity" className="mb-16 scroll-mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Key className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">1. Cryptographic Identity</h2>
          </div>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Unlike traditional messaging apps that require a phone number or email address,
            CipherLink's identity is entirely cryptographic. When you create an account,
            your browser generates an <strong>X25519 (Curve25519) key pair</strong> locally
            using the Web Crypto API. Your public key is your address on the network. Your
            private key never leaves your device.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            The X25519 key pair serves dual purposes: the public key acts as your identity
            on the network, and the private key is used for both Ed25519 signature-based
            authentication and the X3DH Diffie-Hellman key agreement handshake.
          </p>
          <div className="bg-zinc-950 border border-border rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <p className="text-zinc-400 mb-1">{"// Key generation (client-side only, @noble/curves)"}</p>
            <p className="text-green-400">{"const privateKey = crypto.getRandomValues(new Uint8Array(32));"}</p>
            <p className="text-green-400">{"const publicKey  = x25519.getPublicKey(privateKey);"}</p>
            <p className="text-zinc-400 mt-2 mb-1">{"// Private key encrypted at rest (AES-256-GCM + PBKDF2)"}</p>
            <p className="text-cyan-400">{"const encryptedPrivateKey = await encryptWithPIN(privateKey, userPIN);"}</p>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            The private key is encrypted at rest using AES-256-GCM. The encryption key
            is derived from your PIN using <strong>PBKDF2-HMAC-SHA256 with 100,000
            iterations</strong> and a unique 16-byte random salt stored alongside the
            encrypted key. This means even if someone extracts your IndexedDB data, they
            cannot use your private key without knowing your PIN.
          </p>
        </section>

        {/* Section 2: X3DH */}
        <section id="x3dh" className="mb-16 scroll-mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-violet-400" />
            </div>
            <h2 className="text-2xl font-bold">2. X3DH Key Agreement</h2>
          </div>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Before Alice and Bob can exchange messages, they need to establish a shared
            secret key — without ever transmitting that key over the network. CipherLink
            uses <strong>X3DH (Extended Triple Diffie-Hellman)</strong>, a key agreement
            protocol designed by Moxie Marlinspike (Signal) specifically to work even
            when one party is offline.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            X3DH performs three Diffie-Hellman calculations and combines them using HKDF:
          </p>
          <div className="bg-zinc-950 border border-border rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <p className="text-zinc-400 mb-2">{"// Initiator (Alice) calculates:"}</p>
            <p className="text-cyan-400">{"DH1 = DH(IKa,  SPKb)  // Alice identity key   × Bob signed prekey"}</p>
            <p className="text-cyan-400">{"DH2 = DH(EKa,  IKb)   // Alice ephemeral key  × Bob identity key"}</p>
            <p className="text-cyan-400">{"DH3 = DH(EKa,  SPKb)  // Alice ephemeral key  × Bob signed prekey"}</p>
            <p className="text-zinc-400 mt-2 mb-2">{"// Shared secret derived via HKDF:"}</p>
            <p className="text-green-400">{"sharedSecret = concat(DH1, DH2, DH3)"}</p>
          </div>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            The responder (Bob) performs the same calculations in reverse order and
            arrives at the identical shared secret — without it ever being transmitted.
            The server only sees Bob's public prekey bundle, never the computed secret.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The resulting shared secret is then fed through HKDF to derive the initial
            <strong> root key</strong> and <strong>chain keys</strong> that seed the
            Double Ratchet. From this point forward, the X3DH ephemeral keys are deleted
            and the ratchet takes over.
          </p>
        </section>

        {/* Section 3: Double Ratchet */}
        <section id="double-ratchet" className="mb-16 scroll-mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold">3. Double Ratchet Algorithm</h2>
          </div>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            The Double Ratchet Algorithm is what gives CipherLink per-message forward
            secrecy. Every single message uses a <em>different</em> encryption key.
            If an attacker somehow captures and decrypts message #47, they learn
            nothing about messages #1–46 or #48+.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            The "double" refers to two interlocked ratchet mechanisms:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6 ml-4">
            <li>
              <strong className="text-foreground">Symmetric-key ratchet (KDF chain)</strong>:
              Each message advances a chain key using HMAC-SHA256. The message key is derived
              as a side product. Old chain keys are immediately deleted.
            </li>
            <li>
              <strong className="text-foreground">Diffie-Hellman ratchet</strong>:
              Each message includes a new DH ratchet public key. When the other party
              responds with their own new DH key, a new root key is derived, resetting
              the chain. This provides <em>break-in recovery</em> — even if a session
              key is compromised, the next DH ratchet step heals the session.
            </li>
          </ul>
          <div className="bg-zinc-950 border border-border rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <p className="text-zinc-400 mb-2">{"// KDF chain — one step per message:"}</p>
            <p className="text-cyan-400">{"messageKey  = HMAC-SHA256(chainKey, 0x01)"}</p>
            <p className="text-cyan-400">{"nextChainKey = HMAC-SHA256(chainKey, 0x02)"}</p>
            <p className="text-zinc-400 mt-2 mb-2">{"// DH ratchet — on new key from peer:"}</p>
            <p className="text-green-400">{"[rootKey, chainKey] = HKDF(dhOutput, rootKey, \"CipherLink-DHRatchet\")"}</p>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            CipherLink's implementation matches the Signal specification, using 0x01
            for message key derivation and 0x02 for next chain key derivation, with
            HKDF info strings for domain separation (e.g. "CipherLink-DHRatchet").
          </p>
        </section>

        {/* Section 4: AES-256-GCM */}
        <section id="aes-gcm" className="mb-16 scroll-mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold">4. AES-256-GCM Message Encryption</h2>
          </div>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Each message key from the ratchet is used with <strong>AES-256-GCM</strong>
            (Galois/Counter Mode) — an authenticated encryption algorithm that provides
            both confidentiality (no one can read it) and integrity (any tampering is
            detected). A unique 12-byte nonce is generated per message, composed of
            a 4-byte session nonce prefix and an 8-byte counter.
          </p>
          <div className="bg-zinc-950 border border-border rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <p className="text-cyan-400">{"const nonce = sessionNoncePrefix + int64Counter  // 12 bytes, unique per message"}</p>
            <p className="text-green-400">{"const ciphertext = AES-256-GCM.encrypt(messageKey, nonce, plaintext)"}</p>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            The GCM authentication tag ensures that any modification to the ciphertext,
            nonce, or associated data will cause decryption to fail. This prevents
            tampering attacks where an adversary modifies encrypted messages in transit.
          </p>
        </section>

        {/* Section 5: Ed25519 Auth */}
        <section id="server-auth" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6">5. Ed25519 Server Authentication</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Every mutating API request (sending a message, adding a friend, rotating keys)
            must include a cryptographic signature proving the request came from the
            legitimate key holder. There are no passwords or session tokens.
          </p>
          <div className="bg-zinc-950 border border-border rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <p className="text-zinc-400 mb-2">{"// Request headers for every mutating endpoint:"}</p>
            <p className="text-cyan-400">{"X-Public-Key: <64-char hex identity key>"}</p>
            <p className="text-cyan-400">{"X-Timestamp: <unix ms timestamp>"}</p>
            <p className="text-cyan-400">{"X-Request-Nonce: <unique 32-char nonce>"}</p>
            <p className="text-green-400">{"X-Signature: Ed25519.sign(privateKey, path + timestamp + body)"}</p>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            The server verifies the signature, checks the timestamp (±5 minute window),
            and validates the nonce to prevent replay attacks. The verification happens
            before any DB query or business logic. Users do not sign up with passwords
            or emails — public keys <em>are</em> their identities.
          </p>
        </section>

        {/* Section 6: Key storage */}
        <section id="key-storage" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6">6. Key Storage & PIN Protection</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Private keys are stored in the browser's IndexedDB — encrypted. The
            encryption uses AES-256-GCM with a key derived from your PIN via
            PBKDF2-HMAC-SHA256 (100,000 iterations, unique 16-byte salt per device).
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Too many incorrect PIN attempts trigger a 30-second lockout to prevent
            brute-force attacks. Keys are also wiped from memory immediately when
            the session ends or the tab closes.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <strong>Recovery phrase</strong>: A 12-word BIP-39 mnemonic is generated
            during onboarding using the <code>@scure/bip39</code> library. This phrase
            is the only way to recover your identity on a new device. CipherLink never
            stores it — write it down and keep it offline.
          </p>
        </section>

        {/* Section 7: Ephemeral */}
        <section id="ephemeral" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-6">7. Ephemeral Messages & Message Expiry</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Messages in CipherLink can be assigned a TTL (time-to-live). When a message
            expires, it is permanently deleted from the server. The server runs periodic
            cleanup to purge expired messages and their associated encrypted data.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            This ephemeral design means that even if an attacker gains access to the
            server database at some future point, past expired messages are already
            gone — there is nothing to decrypt.
          </p>
        </section>

        {/* Section 8: FAQ */}
        <section id="faq" className="mb-16 scroll-mt-8">
          <h2 className="text-2xl font-bold mb-8">8. Frequently Asked Questions</h2>
          <div className="space-y-6">
            {FAQ_STRUCTURED_DATA.mainEntity.map((item, i) => (
              <div key={i} className="border border-border rounded-lg p-6">
                <h3 className="font-semibold text-foreground mb-3">{item.name}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {item.acceptedAnswer.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center py-12 border-t border-border">
          <h2 className="text-2xl font-bold mb-4">Ready to try CipherLink?</h2>
          <p className="text-muted-foreground mb-8">
            No sign-up required. Your identity is generated locally in your browser.
          </p>
          <Link href="/onboarding">
            <Button size="lg">Get Started — It's Free</Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} CipherLink</span>
          <nav className="flex items-center gap-6">
            <Link href="/open-source"><a className="hover:text-foreground transition-colors">Open Source</a></Link>
            <Link href="/privacy-policy"><a className="hover:text-foreground transition-colors">Privacy Policy</a></Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
