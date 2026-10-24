import { describe, expect, it } from 'vitest';

import { canonicalUrl, normalizePath, routeMetadata, SITE_NAME } from './seo';

describe('routeMetadata', () => {
  it('marks the public catalog routes as indexable', () => {
    for (const path of ['/', '/recipes', '/can-cook', '/recipe/42']) {
      const meta = routeMetadata(path);
      expect(meta.noindex).toBe(false);
      expect(meta.title).toContain(SITE_NAME);
    }
  });

  it('keeps authenticated and utility routes out of the index', () => {
    for (const path of ['/pantry', '/ai-chef', '/ai', '/aichef', '/auth', '/ai-recipe/abc']) {
      expect(routeMetadata(path).noindex).toBe(true);
    }
  });

  it('treats unknown routes as 404s that are not indexed', () => {
    const meta = routeMetadata('/does-not-exist');
    expect(meta.noindex).toBe(true);
    expect(meta.title).toContain('Not found');
  });

  it('gives every page a distinct title', () => {
    const titles = ['/', '/recipes', '/can-cook', '/pantry', '/ai-chef', '/auth'].map(
      (path) => routeMetadata(path).title,
    );
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('normalizePath', () => {
  it('drops trailing slashes, query strings and hashes', () => {
    expect(normalizePath('/recipes/')).toBe('/recipes');
    expect(normalizePath('/recipe/7?ref=mail')).toBe('/recipe/7');
    expect(normalizePath('/pantry#top')).toBe('/pantry');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });
});

describe('canonicalUrl', () => {
  it('joins the origin with the normalized path', () => {
    expect(canonicalUrl('https://whattocook.app/', '/recipes/')).toBe(
      'https://whattocook.app/recipes',
    );
  });

  it('returns undefined without a known origin', () => {
    expect(canonicalUrl('', '/recipes')).toBeUndefined();
  });
});
