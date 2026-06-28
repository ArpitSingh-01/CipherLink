// client/src/pages/OpenSourcePage.tsx
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { ArrowLeft, Code2, GitBranch, Shield, Lock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "CipherLink — Open Source",
  "description": "CipherLink is an open-source, end-to-end encrypted messaging app. View the source code, audit the cryptography, and contribute.",
  "url": "https://cipher-link-alpha.vercel.app/open-source",
  "isPartOf": {
    "@type": "WebSite",
    "name": "CipherLink",
    "url": "https://cipher-link-alpha.vercel.app"
  }
};

export default function OpenSourcePage() {
  useSEO({
    title: 'Open Source — CipherLink | Auditable Encrypted Messaging',
    description: 'CipherLink is open source under the MIT license. Inspect every line of cryptographic code, audit the Signal Protocol implementation, and contribute.',
    keywords: 'open source encryption, auditable messaging, MIT license, signal protocol open source',
    canonicalUrl: 'https://cipher-link-alpha.vercel.app/open-source',
    structuredData: STRUCTURED_DATA,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
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
          <div className="inline-flex items-center gap-2 text-xs font-mono text-green-400 border border-green-500/20 bg-green-500/5 rounded-full px-3 py-1 mb-6">
            <Code2 className="w-3 h-3" />
            Open Source
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Transparency by Default
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-3xl">
            CipherLink is fully open source under the MIT license. Every line of
            cryptographic code is available for inspection, audit, and contribution.
            Privacy software that asks you to trust it blindly isn't privacy software.
          </p>
        </div>

        {/* Why Open Source */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Why Open Source Matters for Encryption</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Auditability</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Anyone can inspect the X3DH key agreement, Double Ratchet implementation,
                and AES-256-GCM encryption to verify there are no backdoors or weaknesses.
              </p>
            </div>
            <div className="border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center mb-4">
                <Shield className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="font-semibold mb-2">Trust Through Verification</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Closed-source encryption requires blind trust. Open source lets you
                verify that the app does exactly what it claims — nothing more, nothing less.
              </p>
            </div>
            <div className="border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center mb-4">
                <GitBranch className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="font-semibold mb-2">Community Driven</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Security researchers and developers can report vulnerabilities, suggest
                improvements, and contribute code to make CipherLink more secure.
              </p>
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Technology Stack</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            CipherLink is built with modern, well-audited technologies:
          </p>
          <div className="bg-zinc-950 border border-border rounded-lg divide-y divide-border">
            <div className="p-4 flex items-start gap-4">
              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded mt-0.5 shrink-0">Frontend</span>
              <p className="text-sm text-muted-foreground">
                React 18 + TypeScript, Vite, Wouter routing, Tailwind CSS, Framer Motion
              </p>
            </div>
            <div className="p-4 flex items-start gap-4">
              <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-1 rounded mt-0.5 shrink-0">Backend</span>
              <p className="text-sm text-muted-foreground">
                Express.js on Vercel Serverless, Supabase (PostgreSQL + Realtime), Drizzle ORM
              </p>
            </div>
            <div className="p-4 flex items-start gap-4">
              <span className="text-xs font-mono text-green-400 bg-green-500/10 px-2 py-1 rounded mt-0.5 shrink-0">Crypto</span>
              <p className="text-sm text-muted-foreground">
                <code>@noble/curves</code> (X25519, Ed25519), Web Crypto API (AES-256-GCM, HKDF, PBKDF2),{' '}
                <code>@scure/bip39</code> (recovery phrases)
              </p>
            </div>
            <div className="p-4 flex items-start gap-4">
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-1 rounded mt-0.5 shrink-0">Protocol</span>
              <p className="text-sm text-muted-foreground">
                Signal Protocol: X3DH key agreement + Double Ratchet Algorithm with
                HMAC-SHA256 KDF chains
              </p>
            </div>
          </div>
        </section>

        {/* License */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">License</h2>
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">MIT License</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              CipherLink is released under the MIT License. You are free to use, copy,
              modify, merge, publish, distribute, sublicense, and/or sell copies of the
              software, subject to including the copyright notice.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              This means you can fork CipherLink, run your own instance, or integrate
              the encryption library into your own projects.
            </p>
            <a
              href="https://github.com/ArpitSingh-01/CipherLink"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Code2 className="w-4 h-4" />
              View on GitHub →
            </a>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center py-12 border-t border-border">
          <h2 className="text-2xl font-bold mb-4">Try CipherLink</h2>
          <p className="text-muted-foreground mb-8">
            No sign-up. No phone number. Your identity is a key pair generated locally.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/onboarding">
              <Button size="lg">Get Started</Button>
            </Link>
            <Link href="/encryption">
              <Button size="lg" variant="outline">How Encryption Works</Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} CipherLink</span>
          <nav className="flex items-center gap-6">
            <Link href="/encryption"><a className="hover:text-foreground transition-colors">Encryption</a></Link>
            <Link href="/privacy-policy"><a className="hover:text-foreground transition-colors">Privacy Policy</a></Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
