import { SiteLayout } from '@/components/layout/SiteLayout';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Check, X, Minus } from 'lucide-react';

const COMPARE_DATA = {
  features: [
    "End-to-end encrypted by default",
    "No phone number required",
    "No email required",
    "No account registration",
    "Forward secrecy (per-message keys)",
    "Signal Protocol implementation",
    "Self-destructing messages",
    "Works in a browser (no download)",
    "No metadata collection",
    "No ads, ever",
    "Multi-device support",
  ],
  apps: [
    {
      name: "CipherLink",
      highlight: true,
      values: [true, true, true, true, true, true, true, true, true, true, true],
    },
    {
      name: "Signal",
      highlight: false,
      values: [true, false, false, false, true, true, true, false, true, true, true],
    },
    {
      name: "WhatsApp",
      highlight: false,
      values: [true, false, false, false, true, true, false, false, false, false, true],
    },
    {
      name: "Telegram",
      highlight: false,
      values: [null, false, false, false, null, false, true, false, false, false, true],
    },
  ]
};

function Cell({ value }: { value: boolean | null }) {
  if (value === true) return <Check className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <X className="w-5 h-5 text-destructive/70 mx-auto" />;
  return <Minus className="w-5 h-5 text-amber-500 mx-auto" />;
}

export default function ComparePage() {
  useSEO({
    title: 'CipherLink vs Signal vs WhatsApp vs Telegram — Encrypted Messaging Comparison',
    description: 'Compare CipherLink, Signal, WhatsApp, and Telegram on privacy, encryption, account requirements, metadata collection, and forward secrecy. No phone number vs phone number required.',
    keywords: 'cipherlink vs signal, encrypted messaging comparison, best private messaging app, messaging app no phone number, signal protocol comparison, WhatsApp alternative',
    canonicalUrl: 'https://cipher-link-alpha.vercel.app/compare',
    structuredData: {
      "@graph": [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is the difference between CipherLink and Signal?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Both CipherLink and Signal use the Signal Protocol (X3DH + Double Ratchet). The key difference is that Signal requires a phone number for registration, while CipherLink requires no phone number, email, or any personal identifier — identity is a cryptographic key pair. CipherLink also runs entirely in a browser with no app download required."
              }
            },
            {
              "@type": "Question",
              "name": "Is CipherLink more private than WhatsApp?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. While WhatsApp uses the Signal Protocol for message content encryption, it collects significant metadata: your phone number, contact list, usage patterns, device information, and IP addresses. CipherLink collects none of this — no phone number, no contact list, no usage metadata. The server stores only encrypted ciphertext."
              }
            },
            {
              "@type": "Question",
              "name": "Does Telegram use end-to-end encryption?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Telegram's default chats are NOT end-to-end encrypted — they use server-side encryption, meaning Telegram can read them. Only 'Secret Chats' are E2E encrypted. CipherLink uses end-to-end encryption for all messages by default, with no opt-in required."
              }
            }
          ]
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cipher-link-alpha.vercel.app/" },
            { "@type": "ListItem", "position": 2, "name": "Compare", "item": "https://cipher-link-alpha.vercel.app/compare" }
          ]
        }
      ]
    }
  });

  return (
    <SiteLayout>
      <div className="max-w-5xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-primary border border-primary/20 bg-primary/5 rounded-full px-3 py-1 mb-6">
            Comparison
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            How does CipherLink compare?
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Every messaging app claims to be "secure." The details are what matter.
          </p>
        </div>

        {/* Comparison table */}
        <div className="overflow-x-auto border border-border rounded-xl bg-card mb-8">
          <table className="w-full text-sm text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-border/80">
                <th className="p-4 font-semibold text-foreground">Feature</th>
                {COMPARE_DATA.apps.map(app => (
                  <th key={app.name} className={`p-4 text-center font-semibold ${app.highlight ? 'text-primary bg-primary/5' : 'text-foreground'}`}>
                    {app.name}
                    {app.highlight && (
                      <span className="block text-[10px] uppercase font-mono tracking-wider text-primary mt-1">← You are here</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_DATA.features.map((feature, i) => (
                <tr key={feature} className="border-b border-border/60 last:border-b-0 hover:bg-muted/10 transition-colors">
                  <td className="p-4 font-medium text-foreground">{feature}</td>
                  {COMPARE_DATA.apps.map(app => (
                    <td key={app.name} className={`p-4 text-center ${app.highlight ? 'bg-primary/5' : ''}`}>
                      <Cell value={app.values[i]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Telegram caveat */}
        <div className="text-xs text-muted-foreground mb-16 max-w-3xl leading-relaxed">
          ⚠️ Yellow (—) for Telegram = optional or partial feature. Telegram's default chats are not end-to-end encrypted.
        </div>

        {/* Three callout cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {[
            {
              title: "vs Signal",
              points: [
                "Signal requires a phone number. CipherLink requires nothing.",
                "Signal does not run in a browser — requires a native app.",
                "Both use the Signal Protocol for encryption.",
                "Both have forward secrecy by default.",
              ]
            },
            {
              title: "vs WhatsApp",
              points: [
                "WhatsApp collects your phone number, contacts, and metadata.",
                "WhatsApp's encryption key trust relies on a centralized server.",
                "CipherLink has no metadata collection by design.",
                "CipherLink's server cannot read any message, even in a breach.",
              ]
            },
            {
              title: "vs Telegram",
              points: [
                "Telegram default chats are NOT end-to-end encrypted.",
                "Telegram stores messages on their servers — readable by them.",
                "CipherLink encrypts everything before it leaves your device.",
                "CipherLink has no groups, channels, or bots — by design.",
              ]
            }
          ].map(({ title, points }) => (
            <div key={title} className="p-6 bg-card border border-border rounded-xl">
              <h3 className="text-lg font-bold text-foreground mb-4 border-b border-border/60 pb-2">{title}</h3>
              <ul className="space-y-3">
                {points.map((p, idx) => (
                  <li key={idx} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="text-primary font-bold select-none">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ section */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">Common questions about the comparison</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                q: "What is the difference between CipherLink and Signal?",
                a: "Both use the Signal Protocol. The critical difference is identity: Signal requires a phone number. CipherLink requires nothing — identity is a cryptographic key pair generated in your browser. CipherLink also runs without any app installation."
              },
              {
                q: "Is CipherLink more private than WhatsApp?",
                a: "Yes. WhatsApp encrypts message content but collects your phone number, contact list, usage patterns, and device fingerprint. CipherLink collects none of this. No phone number, no contact list, no usage metadata — the server sees only encrypted ciphertext."
              },
              {
                q: "Does Telegram have end-to-end encryption?",
                a: "Only in 'Secret Chats', which are opt-in. Telegram's default chats use server-side encryption — Telegram can read them. CipherLink uses E2E encryption for every message, with no opt-in required."
              },
              {
                q: "What does 'no metadata collection' actually mean?",
                a: "Traditional messaging apps log who you message, when, how often, and from what device — even if they can't read the content. CipherLink's server stores no sender/receiver correlation, no timestamps in plaintext, and no IP logs. Even a full database breach is nearly useless to an attacker."
              }
            ].map(({ q, a }) => (
              <div key={q} className="p-6 bg-muted/20 border border-border/40 rounded-xl">
                <h4 className="font-semibold text-foreground mb-2 text-sm sm:text-base">{q}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-12 border-t border-border mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-3">Try the most private option</h2>
          <p className="text-muted-foreground mb-8">
            No phone number. No email. Just cryptography.
          </p>
          <Link href="/onboarding">
            <Button size="lg">Get Started — Free</Button>
          </Link>
        </div>

      </div>
    </SiteLayout>
  );
}
