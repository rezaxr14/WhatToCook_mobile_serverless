/**
 * Per-route document metadata.
 *
 * The app is a locale-agnostic SPA (the language is a preference, not a URL
 * segment), so titles/descriptions are English here and translated at the
 * UI layer. Public catalog routes are indexable; authenticated/utility routes
 * and ephemeral AI results are not.
 */

export const SITE_NAME = 'WhatToCook';

export const SITE_DESCRIPTION =
  'Discover recipes, match meals to your pantry ingredients, and generate bespoke dishes with AI.';

/** Routes that belong in `sitemap.xml`. */
export const INDEXABLE_ROUTES = ['/', '/recipes', '/can-cook'] as const;

export interface RouteMetadata {
  title: string;
  description: string;
  noindex: boolean;
}

const PAGE_METADATA: Record<string, Omit<RouteMetadata, 'noindex'>> = {
  '/': {
    title: `${SITE_NAME} — AI-Powered Intelligent Recipe Studio`,
    description: SITE_DESCRIPTION,
  },
  '/recipes': {
    title: `Recipe catalog — ${SITE_NAME}`,
    description: 'Browse the curated recipe catalog with ingredients, steps and substitutions.',
  },
  '/can-cook': {
    title: `What can I cook? — ${SITE_NAME}`,
    description:
      'Match the ingredients you already have against the catalog and cook without shopping.',
  },
};

/** Strip query/hash and a trailing slash so `/recipes/` and `/recipes` agree. */
export function normalizePath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

const APP_ROUTE_TITLES: Record<string, string> = {
  '/pantry': `My pantry — ${SITE_NAME}`,
  '/ai-chef': `AI Chef — ${SITE_NAME}`,
  '/aichef': `AI Chef — ${SITE_NAME}`,
  '/ai': `AI Chef — ${SITE_NAME}`,
  '/auth': `Sign in — ${SITE_NAME}`,
};

export function routeMetadata(pathname: string): RouteMetadata {
  const path = normalizePath(pathname);
  const page = PAGE_METADATA[path];
  if (page) return { ...page, noindex: false };

  if (path.startsWith('/recipe/')) {
    return {
      title: `Recipe — ${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      noindex: false,
    };
  }

  // Anonymous/AI-generated recipes are per-user and ephemeral: never index them.
  if (path.startsWith('/ai-recipe/')) {
    return { title: `AI recipe — ${SITE_NAME}`, description: SITE_DESCRIPTION, noindex: true };
  }

  const appTitle = APP_ROUTE_TITLES[path];
  if (appTitle) return { title: appTitle, description: SITE_DESCRIPTION, noindex: true };

  return {
    title: `Not found — ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    noindex: true,
  };
}

/** Absolute canonical URL for a path, or `undefined` when the site origin is unknown. */
export function canonicalUrl(origin: string, pathname: string): string | undefined {
  if (!origin) return undefined;
  return `${origin.replace(/\/$/, '')}${normalizePath(pathname)}`;
}
