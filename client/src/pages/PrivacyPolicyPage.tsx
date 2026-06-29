// client/src/pages/PrivacyPolicyPage.tsx
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteLayout } from '@/components/layout/SiteLayout';

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Privacy Policy — CipherLink",
  "description": "CipherLink privacy policy. We collect no personal data, store no plaintext messages, and require no account registration.",
  "url": "https://cipher-link-alpha.vercel.app/privacy-policy",
  "isPartOf": {
    "@type": "WebSite",
    "name": "CipherLink",
    "url": "https://cipher-link-alpha.vercel.app"
  }
};

export default function PrivacyPolicyPage() {
  useSEO({
    title: 'Privacy Policy — CipherLink',
    description: 'CipherLink privacy policy. No personal data collected, no plaintext stored, no account required. End-to-end encrypted messaging with zero-knowledge architecture.',
    keywords: 'privacy policy, encrypted messaging privacy, zero knowledge messaging, no data collection',
    canonicalUrl: 'https://cipher-link-alpha.vercel.app/privacy-policy',
    structuredData: {
      "@graph": [
        STRUCTURED_DATA,
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cipher-link-alpha.vercel.app/" },
            { "@type": "ListItem", "position": 2, "name": "Privacy Policy", "item": "https://cipher-link-alpha.vercel.app/privacy-policy" }
          ]
        }
      ]
    },
  });

  return (
    <SiteLayout>
      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-primary border border-primary/20 bg-primary/5 rounded-full px-3 py-1 mb-6">
            <Shield className="w-3 h-3" />
            Privacy Policy
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">
            Last updated: June 29, 2026
          </p>
        </div>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          {/* Summary */}
          <section>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-8">
              <h2 className="text-lg font-semibold mb-3 mt-0">Summary</h2>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                <li>CipherLink collects <strong className="text-foreground">no personal information</strong> — no name, email, phone number, or IP address logging.</li>
                <li>All messages are <strong className="text-foreground">end-to-end encrypted</strong> using the Signal Protocol. The server stores only ciphertext.</li>
                <li>Your identity is a <strong className="text-foreground">cryptographic key pair</strong> generated locally in your browser.</li>
                <li>Private keys <strong className="text-foreground">never leave your device</strong>.</li>
                <li>CipherLink is <strong className="text-foreground">independently verifiable</strong> — the cryptographic protocol is documented and publicly auditable.</li>
              </ul>
            </div>
          </section>

          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-bold mb-4">1. Information We Do Not Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              CipherLink is designed to minimize data collection. We do not collect or store:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
              <li>Names, email addresses, or phone numbers</li>
              <li>IP addresses (no server-side logging)</li>
              <li>Location data or device identifiers</li>
              <li>Message content (only encrypted ciphertext touches the server)</li>
              <li>Contact lists or social graphs</li>
              <li>Browsing history or usage analytics beyond anonymous page views</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-bold mb-4">2. Information Stored on the Server</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The CipherLink server stores the minimum data required to deliver messages:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
              <li><strong className="text-foreground">Public keys</strong>: Your X25519 public key, used as your network identity and for key agreement.</li>
              <li><strong className="text-foreground">Encrypted messages</strong>: AES-256-GCM ciphertext. The server cannot decrypt these — it does not have your private key.</li>
              <li><strong className="text-foreground">Prekey bundles</strong>: Public keys uploaded for the X3DH handshake so others can initiate conversations with you even when you're offline.</li>
              <li><strong className="text-foreground">Friend connections</strong>: A record that two public keys have an active conversation. No metadata about message content or timing patterns is stored beyond what is necessary for delivery.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-bold mb-4">3. End-to-End Encryption</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All chat messages are encrypted on your device before transmission and can
              only be decrypted by the intended recipient. CipherLink implements the Signal
              Protocol (X3DH key agreement + Double Ratchet Algorithm) with AES-256-GCM
              encryption.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The server <em>never</em> has access to plaintext messages, private keys, or
              encryption keys. Even if compelled by legal process, we cannot provide message
              content because we do not have the technical ability to decrypt it.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-bold mb-4">4. Local Data Storage</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              CipherLink stores the following data locally in your browser (IndexedDB):
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
              <li><strong className="text-foreground">Private key</strong>: Encrypted at rest with AES-256-GCM. The encryption key is derived from your PIN via PBKDF2 (100,000 iterations).</li>
              <li><strong className="text-foreground">Session state</strong>: Double Ratchet chain keys and counters, required to decrypt incoming messages.</li>
              <li><strong className="text-foreground">Settings</strong>: UI preferences (theme, notification settings).</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Clearing your browser data will delete all local keys and session state. You
              can recover your identity using your 12-word recovery phrase.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-bold mb-4">5. Analytics</h2>
            <p className="text-muted-foreground leading-relaxed">
              CipherLink uses <strong className="text-foreground">Vercel Analytics</strong> for
              anonymous, aggregated page view metrics. This collects no personally
              identifiable information, no cookies, and no cross-site tracking. It measures
              only page views and web vitals performance metrics. You can read Vercel's
              privacy policy at{' '}
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                vercel.com/legal/privacy-policy
              </a>.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-bold mb-4">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Ephemeral messages are automatically deleted from the server when their TTL
              expires. The server runs periodic cleanup to permanently remove expired
              encrypted data. Non-ephemeral messages remain as encrypted ciphertext until
              the conversation is deleted by both parties.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You can delete your account at any time by clearing your local keys. Since
              your identity is a key pair (not an email or phone number), there is no
              "account" on the server to delete — only the associated public key and
              encrypted message blobs.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-bold mb-4">7. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              CipherLink uses the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2 mt-4">
              <li><strong className="text-foreground">Supabase</strong>: Hosts the PostgreSQL database and provides real-time message delivery. Stores only encrypted data.</li>
              <li><strong className="text-foreground">Vercel</strong>: Hosts the frontend and serverless API functions.</li>
              <li><strong className="text-foreground">Google Fonts</strong>: Serves the Space Grotesk and Roboto Mono typefaces.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-bold mb-4">8. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              If this privacy policy changes, the update will be reflected in the "Last
              updated" date at the top of this page. Since CipherLink collects no contact information, we cannot
              send notifications about policy changes — check this page periodically.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-bold mb-4">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about this privacy policy or CipherLink's security practices,
              please reach out through the project website or contact the developer directly.
            </p>
          </section>
        </div>
      </main>

    </SiteLayout>
  );
}
