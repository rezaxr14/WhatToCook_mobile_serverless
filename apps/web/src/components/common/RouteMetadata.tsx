import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { canonicalUrl, normalizePath, routeMetadata } from '../../lib/seo';

function setMeta(name: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string | undefined): void {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.createElement('link');
  link.setAttribute('rel', 'canonical');
  link.setAttribute('href', href);
  if (!existing) document.head.appendChild(link);
}

/**
 * Keeps the document head in sync with the route. There is no SSR here, so
 * crawlers that execute JavaScript see the right title/description/robots tag;
 * static hosts should also serve the generated `sitemap.xml` and `robots.txt`.
 */
export function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = routeMetadata(pathname);
    document.title = meta.title;
    setMeta('description', meta.description);
    setMeta('robots', meta.noindex ? 'noindex, nofollow' : 'index, follow');
    setCanonical(canonicalUrl(window.location.origin, normalizePath(pathname)));
  }, [pathname]);

  return null;
}
