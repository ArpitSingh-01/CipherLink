import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
  robots?: string;
  structuredData?: Record<string, unknown>;
}

/**
 * Custom React hook to dynamically manage SEO meta tags for SPA routing.
 * Updates on every navigation so each page has correct meta independently.
 */
export function useSEO({
  title,
  description,
  keywords,
  ogImage,
  canonicalUrl,
  robots,
  structuredData,
}: SEOProps) {
  useEffect(() => {
    // Title
    document.title = title;

    const updateMeta = (nameOrProp: string, content: string, isProp = false) => {
      const attr = isProp ? 'property' : 'name';
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${nameOrProp}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, nameOrProp);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Canonical URL — use pathname only to exclude params/hash
    const pageUrl = canonicalUrl || (window.location.origin + window.location.pathname);

    updateMeta('description', description);
    if (keywords) updateMeta('keywords', keywords);
    if (robots) updateMeta('robots', robots);

    // Open Graph
    updateMeta('og:title', title, true);
    updateMeta('og:description', description, true);
    updateMeta('og:url', pageUrl, true);
    if (ogImage) {
      updateMeta('og:image', ogImage, true);
    }

    // Twitter
    updateMeta('twitter:title', title);
    updateMeta('twitter:description', description);
    updateMeta('twitter:url', pageUrl);
    if (ogImage) updateMeta('twitter:image', ogImage);

    // Canonical link element
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', pageUrl);

    // Structured data injection (per-page schemas beyond what index.html has)
    if (structuredData) {
      const existingScript = document.querySelector('script[data-seo-dynamic]');
      if (existingScript) existingScript.remove();
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-dynamic', 'true');
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }

    // Cleanup dynamic structured data on unmount
    return () => {
      document.querySelector('script[data-seo-dynamic]')?.remove();
    };
  }, [title, description, keywords, ogImage, canonicalUrl, robots, structuredData]);
}
