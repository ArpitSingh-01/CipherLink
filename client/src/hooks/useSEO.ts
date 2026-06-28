import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

/**
 * Custom React hook to dynamically manage document titles and meta tags for SPA routing.
 */
export function useSEO({ title, description, keywords, ogImage, canonicalUrl }: SEOProps) {
  useEffect(() => {
    // Update Title
    document.title = title;

    // Helper to update or create meta tags in <head>
    const updateMetaTag = (name: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let element = document.querySelector(`meta[${attribute}="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // Update standard meta tags
    updateMetaTag('description', description);
    if (keywords) {
      updateMetaTag('keywords', keywords);
    }

    // Update OpenGraph tags
    updateMetaTag('og:title', title, true);
    updateMetaTag('og:description', description, true);
    if (ogImage) {
      updateMetaTag('og:image', ogImage, true);
    }

    // Update Twitter Card tags
    updateMetaTag('twitter:title', title);
    updateMetaTag('twitter:description', description);
    if (ogImage) {
      updateMetaTag('twitter:image', ogImage);
    }

    // Update Canonical Link tag
    let canonicalElement = document.querySelector('link[rel="canonical"]');
    if (canonicalUrl) {
      if (!canonicalElement) {
        canonicalElement = document.createElement('link');
        canonicalElement.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalElement);
      }
      canonicalElement.setAttribute('href', canonicalUrl);
    } else if (canonicalElement) {
      canonicalElement.setAttribute('href', window.location.href);
    }
  }, [title, description, keywords, ogImage, canonicalUrl]);
}
