import { SiteLayout } from '@/components/layout/SiteLayout';
import { useSEO } from '@/hooks/useSEO';
import { Shield, Cpu, Lock, Key, Zap, Globe } from 'lucide-react';

export default function TechnologyPage() {
  useSEO({
    title: 'Technology — CipherLink | Signal Protocol Implementation',
    description: 'Learn how CipherLink is built: Signal Protocol (X3DH + Double Ratchet), AES-256-GCM, Ed25519 authentication, and a zero-knowledge server architecture.',
    keywords: 'signal protocol implementation, x3dh double ratchet, aes-256-gcm, ed25519 authentication, zero knowledge server',
    canonicalUrl: 'https://cipher-link-alpha.vercel.app/technology',
    structuredData: {
      "@graph": [
        {
          "@context": "https://schema.org",
          "@type": "TechArticle",
          "headline": "CipherLink Technology Stack — Signal Protocol Implementation",
          "description": "Technical overview of CipherLink's cryptographic architecture: X3DH key agreement, Double Ratchet algorithm, AES-256-GCM message encryption, and Ed25519 device authentication.",
          "url": "https://cipher-link-alpha.vercel.app/technology",
          "author": { "@type": "Person", "name": "Arpit Singh" },
          "datePublished": "2025-01-01",
          "dateModified": "2026-06-29"
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cipher-link-alpha.vercel.app/" },
            { "@type": "ListItem", "position": 2, "name": "Technology", "item": "https://cipher-link-alpha.vercel.app/technology" }
          ]
        }
      ]
    }
  });

  return (
    <SiteLayout>
      <div className="max-w-4xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-primary border border-primary/20 bg-primary/5 rounded-full px-3 py-1 mb-6">
            <Cpu className="w-3.5 h-3.5" />
            Architecture Overview
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Built on the <span className="text-primary">Signal Protocol</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            CipherLink implements the same cryptographic protocol used by Signal and WhatsApp —
            X3DH key agreement combined with the Double Ratchet algorithm.
            Every architectural decision prioritises privacy over convenience.
          </p>
        </div>

        {/* Tech stack grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          {[
            {
              icon: Key,
              title: "X3DH Key Agreement",
              tag: "Cryptography",
              body: "Extended Triple Diffie-Hellman establishes a shared secret without either party transmitting it. Three DH calculations (DH1, DH2, DH3) across identity and ephemeral keys produce a secret that the network never sees."
            },
            {
              icon: Lock,
              title: "Double Ratchet Algorithm",
              tag: "Forward Secrecy",
              body: "Each message uses a unique encryption key derived via HMAC-SHA256 chain evolution. A Diffie-Hellman ratchet provides break-in recovery — compromising one message key reveals exactly one message."
            },
            {
              icon: Shield,
              title: "AES-256-GCM",
              tag: "Message Encryption",
              body: "Authenticated encryption provides both confidentiality and integrity. A 12-byte nonce (4-byte session prefix + 8-byte counter) ensures uniqueness. The AAD includes message TTL — making expiry tamper-evident."
            },
            {
              icon: Zap,
              title: "Ed25519 Authentication",
              tag: "Server Auth",
              body: "Every API request carries an Ed25519 signature over the request body hash, timestamp, and a per-request nonce. No passwords, no sessions. Nonces are consumed atomically to prevent replay attacks."
            },
            {
              icon: Globe,
              title: "Zero-Knowledge Server",
              tag: "Privacy",
              body: "The server stores only AES-256-GCM ciphertext. It cannot decrypt messages, derive contact lists, or read metadata about conversations. Even a full database breach reveals no readable content."
            },
            {
              icon: Cpu,
              title: "Cryptographic Identity",
              tag: "No Account Required",
              body: "Identity is an X25519 key pair generated locally in the browser. No email, no phone number, no username. The private key is encrypted at rest with PBKDF2-HMAC-SHA256 (100,000 iterations) derived from a PIN."
            },
          ].map(({ icon: Icon, title, tag, body }) => (
            <div key={title} className="p-6 bg-card border border-border/80 rounded-xl relative overflow-hidden group hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase">{tag}</span>
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Stack table */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold mb-6 text-center">Full Technology Stack</h2>
          <div className="border border-border/80 rounded-xl overflow-hidden bg-card">
            {[
              ["Cryptographic library", "@noble/curves — X25519 DH, Ed25519 signing"],
              ["Message encryption", "Web Crypto API — AES-256-GCM, HKDF, HMAC-SHA256"],
              ["Protocol", "Signal Protocol — X3DH key agreement + Double Ratchet"],
              ["Key derivation", "HKDF-SHA256 (RFC 5869) + PBKDF2-HMAC-SHA256"],
              ["Frontend", "React 18 + TypeScript + Vite + Tailwind CSS"],
              ["Backend", "Express + TypeScript + Drizzle ORM"],
              ["Database", "PostgreSQL (Supabase) — stores ciphertext only"],
              ["Realtime", "Supabase Realtime — broadcast signals only, no message content"],
              ["Deployment", "Vercel Serverless Functions"],
              ["Key storage", "IndexedDB (client-side, AES-encrypted at rest)"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-1 sm:grid-cols-2 p-4 border-b border-border/60 last:border-b-0 text-sm leading-relaxed">
                <span className="font-semibold text-foreground">{label}</span>
                <span className="text-muted-foreground font-mono text-xs sm:text-sm">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Creator card — good for E-E-A-T */}
        <div className="p-8 bg-muted/30 border border-border/80 rounded-2xl mb-16">
          <h2 className="text-xl font-bold mb-4">About the Creator</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            CipherLink was built by Arpit Singh, a Computer
            Science student at DDU Gorakhpur University, as a research project into practical
            implementations of modern cryptographic protocols. The project demonstrates that
            Signal-grade encryption is achievable in a web browser without native app dependencies.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The cryptographic implementation passes manual verification against the Signal Protocol
            specification. Key decisions — algorithm choices, threat model, session management — are
            documented in the Encryption page.
          </p>
        </div>

      </div>
    </SiteLayout>
  );
}
