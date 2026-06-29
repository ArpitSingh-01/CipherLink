import { Link, useLocation } from 'wouter';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NAV_LINKS = [
  { href: '/encryption', label: 'How It Works' },
  { href: '/compare', label: 'Compare' },
  { href: '/faq', label: 'FAQ' },
  { href: '/technology', label: 'Technology' },
];

export function SiteNav() {
  const [location] = useLocation();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-6 mx-auto">

        {/* Logo */}
        <div className="flex items-center">
          <Link href="/">
            <a className="mr-6 flex items-center space-x-2 font-bold text-foreground">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <span>CipherLink</span>
            </a>
          </Link>
        </div>

        {/* Nav links — hidden on mobile, visible on md+ */}
        <div className="hidden md:flex gap-6 items-center">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>
              <a className={`text-sm transition-colors ${
                location === href
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
                {label}
              </a>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center">
          <Link href="/onboarding">
            <Button size="sm">Launch App</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
