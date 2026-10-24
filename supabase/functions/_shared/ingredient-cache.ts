/**
 * Pure helpers for the `cache-ingredient-images` maintenance function.
 *
 * Keeping these outside `index.ts` means the Deno test suite can import them
 * without starting the HTTP server.
 */

export const INGREDIENT_IMAGE_BUCKET = 'ingredient-images';
export const INGREDIENT_IMAGE_PREFIX = 'ingredients';
/** One year. Object names are content-hashed, so replacing a photo changes the URL. */
export const INGREDIENT_IMAGE_CACHE_CONTROL = '31536000';
export const MAX_INGREDIENT_IMAGE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Normalized MIME type without parameters (`image/jpeg; charset=...`). */
export function mediaType(contentType: string | null | undefined): string | null {
  const value = (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase();
  return value && value in CONTENT_TYPE_EXTENSIONS ? value : null;
}

export function extensionForContentType(contentType: string | null | undefined): string | null {
  const type = mediaType(contentType);
  return type ? (CONTENT_TYPE_EXTENSIONS[type] ?? null) : null;
}

/**
 * Safe object key: `ingredients/<slug>-<hash>.<ext>`. Slugs come from the
 * catalog, but sanitize anyway so a bad row can never escape the prefix.
 */
export function ingredientObjectPath(
  slug: string,
  contentHash: string,
  contentType: string | null | undefined,
): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const hash = contentHash
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
    .slice(0, 16);
  if (!safeSlug) throw new Error('Ingredient slug is empty.');
  if (hash.length < 8) throw new Error('Content hash is too short.');
  const extension = extensionForContentType(contentType);
  if (!extension) throw new Error(`Unsupported ingredient image type: ${contentType ?? 'unknown'}`);
  return `${INGREDIENT_IMAGE_PREFIX}/${safeSlug}-${hash}.${extension}`;
}

/** `true` when `path` is an object this function is allowed to replace/delete. */
export function isManagedIngredientPath(path: string | null | undefined): boolean {
  return Boolean(path && path.startsWith(`${INGREDIENT_IMAGE_PREFIX}/`) && !path.includes('..'));
}

export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? '';
}

/**
 * Compare a request token with the configured secret in constant time. Hashing
 * first makes the comparison length-independent.
 */
export async function secretMatches(token: string, expected: string): Promise<boolean> {
  if (!token || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
