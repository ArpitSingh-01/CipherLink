import { Link } from 'wouter';
import { Shield } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/20">
      <div className="container max-w-screen-2xl py-10 px-6 mx-auto">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">

          <div className="flex flex-col gap-2">
            <Link href="/">
              <a className="flex items-center space-x-2 font-bold text-foreground">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                </div>
                <span>CipherLink</span>
              </a>
            </Link>
            <p className="text-xs text-muted-foreground mt-2 leading-normal">
              End-to-end encrypted messaging. Signal Protocol. No account required.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Product</span>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {[
                { href: '/', label: 'Home' },
                { href: '/onboarding', label: 'Get Started' },
                { href: '/compare', label: 'Compare' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href}>
                    <a className="hover:text-foreground transition-colors">{label}</a>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Learn</span>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {[
                { href: '/encryption', label: 'How It Works' },
                { href: '/faq', label: 'FAQ' },
                { href: '/technology', label: 'Technology' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href}>
                    <a className="hover:text-foreground transition-colors">{label}</a>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Legal</span>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {[
                { href: '/privacy-policy', label: 'Privacy Policy' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href}>
                    <a className="hover:text-foreground transition-colors">{label}</a>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="mt-8 border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} CipherLink · All rights reserved</p>
          <div className="flex items-center gap-4">
            <span>Signal Protocol · AES-256-GCM · Ed25519</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
