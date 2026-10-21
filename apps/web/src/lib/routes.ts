import type { Locale } from '@whattocook/shared';

/** Locale-prefixed path used by the router and the prerenderer. */
export function localePath(locale: Locale, path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${normalized === '/' ? '' : normalized}`;
}
