import { SiteLayout } from '@/components/layout/SiteLayout';
import { useSEO } from '@/hooks/useSEO';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

const FAQS = [
  {
    category: "Getting Started",
    items: [
      {
        q: "Do I need a phone number or email to use CipherLink?",
        a: "No. CipherLink requires no phone number, email address, username, or any personal information. Your identity is a cryptographic key pair (Ed25519 + X25519) generated locally in your browser. The public key is your address on the network; the private key never leaves your device."
      },
      {
        q: "Do I need to download an app?",
        a: "No. CipherLink runs entirely in your browser. No download required. It works on Chrome, Firefox, Safari, and Edge on desktop and mobile. You can optionally install it as a PWA (Progressive Web App) for an app-like experience — but it's not required."
      },
      {
        q: "How do I add a friend?",
        a: "CipherLink uses 8-character friend codes (like XKCD-PW8A) instead of phone numbers or usernames. Share your code with someone and enter theirs — no server has a record of your relationship before both sides accept."
      },
      {
        q: "What happens if I lose access to my device?",
        a: "During onboarding, you receive a 12-word recovery phrase. This phrase is the only way to restore your identity on a new device. CipherLink never stores it — write it down and keep it offline. Without the recovery phrase, your identity cannot be recovered."
      },
    ]
  },
  {
    category: "Privacy & Security",
    items: [
      {
        q: "Can CipherLink read my messages?",
        a: "No. Messages are encrypted on your device before they leave it. The server stores only AES-256-GCM ciphertext with no access to your private keys. Even a complete database breach by an attacker would yield nothing readable."
      },
      {
        q: "What is forward secrecy and does CipherLink have it?",
        a: "Forward secrecy means that each message is encrypted with a unique key that is deleted after use. Even if an attacker captures your long-term identity key, they cannot decrypt past messages because the per-message keys no longer exist. CipherLink's Double Ratchet implementation provides forward secrecy on every single message."
      },
      {
        q: "What metadata does CipherLink collect?",
        a: "Very little. The server knows that two public keys exchanged encrypted blobs at a given time — no names, no content, no contact lists, no IP addresses in permanent storage. Vercel's CDN logs requests transiently (per Vercel's privacy policy) but CipherLink's application layer stores no metadata beyond what is cryptographically necessary."
      },
      {
        q: "Are self-destructing messages really permanent?",
        a: "The server deletes ciphertext when a message's TTL expires. However, recipients can screenshot or photograph their screen before deletion. Self-destructing messages are a server-side deletion guarantee — not a cryptographic guarantee against human copying."
      },
      {
        q: "What are Safety Numbers?",
        a: "Safety numbers are a fingerprint of yours and your contact's identity keys combined. By comparing safety numbers out-of-band (in person, via a video call, via a separate channel), you can verify you are communicating with the real person and that no MITM (man-in-the-middle) attack is occurring."
      },
    ]
  },
  {
    category: "Cryptography",
    items: [
      {
        q: "What encryption algorithm does CipherLink use?",
        a: "CipherLink uses AES-256-GCM for message encryption, HKDF-SHA256 for key derivation, HMAC-SHA256 for chain key evolution, X25519 for Diffie-Hellman key agreement, and Ed25519 for digital signatures. All primitives come from the @noble/curves library and the browser's native Web Crypto API."
      },
      {
        q: "What is X3DH?",
        a: "X3DH (Extended Triple Diffie-Hellman) is the key agreement protocol used to establish a shared secret between two parties, even when one is offline. It performs three DH calculations across long-term identity keys and short-term ephemeral keys, producing a shared secret that neither party ever transmits directly."
      },
      {
        q: "What is the Double Ratchet Algorithm?",
        a: "The Double Ratchet Algorithm evolves encryption keys with every message. It has two ratchets: a symmetric ratchet (HMAC-SHA256 key evolution per message) and a Diffie-Hellman ratchet (key re-generation when both parties exchange new DH keys). This provides both forward secrecy and break-in recovery."
      },
      {
        q: "Is the same Signal Protocol used by Signal and WhatsApp?",
        a: "Yes. CipherLink implements the same Signal Protocol specification (X3DH + Double Ratchet) that Signal, WhatsApp, and Google Messages use. The cryptographic primitives are equivalent. The differences are in account requirements, metadata handling, and server architecture — not the core encryption."
      },
    ]
  },
  {
    category: "Limits & Restrictions",
    items: [
      {
        q: "How long are messages stored?",
        a: "Messages are automatically deleted from the server when their TTL (time-to-live) expires. You can set TTLs from 30 seconds to 24 hours. There is no permanent message storage — CipherLink is not a message archive."
      },
      {
        q: "Can I use CipherLink on multiple devices?",
        a: "Yes. Device linking uses a cryptographic challenge-response protocol. You add a new device from your primary device, which issues a signed linking request. The new device must prove it controls its key pair by responding to the challenge. Your private key is never transferred."
      },
      {
        q: "Does CipherLink support group chats?",
        a: "Not currently. CipherLink supports 1-to-1 encrypted conversations only. Group messaging introduces significant protocol complexity (key distribution, member joins/leaves, etc.) that is not yet implemented."
      },
    ]
  }
];

const FAQ_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": FAQS.flatMap(cat =>
    cat.items.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a }
    }))
  )
};

export default function FAQPage() {
  const [open, setOpen] = useState<string | null>(null);

  useSEO({
    title: 'FAQ — CipherLink | Encrypted Messaging Questions Answered',
    description: 'Answers to common questions about CipherLink: how encryption works, whether a phone number is needed, what metadata is collected, forward secrecy, Double Ratchet, safety numbers, and more.',
    keywords: 'cipherlink faq, encrypted messaging questions, signal protocol faq, forward secrecy explained, double ratchet faq, private messaging faq',
    canonicalUrl: 'https://cipher-link-alpha.vercel.app/faq',
    structuredData: {
      "@graph": [
        FAQ_STRUCTURED_DATA,
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cipher-link-alpha.vercel.app/" },
            { "@type": "ListItem", "position": 2, "name": "FAQ", "item": "https://cipher-link-alpha.vercel.app/faq" }
          ]
        }
      ]
    },
  });

  return (
    <SiteLayout>
      <div className="max-w-4xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Everything you need to know about CipherLink, its privacy model,
            and the cryptography that powers it.
          </p>
        </div>

        {/* Accordions */}
        <div className="space-y-12 mb-20 max-w-3xl mx-auto">
          {FAQS.map(({ category, items }) => (
            <div key={category} className="space-y-4">
              <h2 className="text-xl font-bold text-foreground border-b border-border/80 pb-2">{category}</h2>
              <div className="space-y-3">
                {items.map(({ q, a }) => {
                  const isOpen = open === q;
                  return (
                    <div key={q} className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
                      <button
                        onClick={() => setOpen(isOpen ? null : q)}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors text-sm sm:text-base font-semibold text-foreground"
                        aria-expanded={isOpen}
                      >
                        <span>{q}</span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="p-5 pt-0 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border/20 bg-muted/5">
                          {a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Banner */}
        <div className="text-center py-12 border-t border-border/80 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-3">Still have questions?</h2>
          <p className="text-muted-foreground mb-8 text-sm">
            Read the full technical breakdown of how the encryption works,
            or just try CipherLink — no account needed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/encryption">
              <Button variant="outline" className="w-full sm:w-auto">Read Encryption Docs</Button>
            </Link>
            <Link href="/onboarding">
              <Button className="w-full sm:w-auto">Try CipherLink Free</Button>
            </Link>
          </div>
        </div>

      </div>
    </SiteLayout>
  );
}
