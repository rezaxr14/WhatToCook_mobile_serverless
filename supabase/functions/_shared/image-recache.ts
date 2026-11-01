/**
 * Pure helpers for the `recache-images` maintenance function.
 *
 * The function is the only writer of the `image_sources` table's storage
 * columns. Keeping the decisions here lets the Deno suite cover naming,
 * validation and cache headers without network access.
 */

export const IMAGE_BUCKET = 'recipe-images';
/** Ten years, in seconds (Storage's `cacheControl` unit). */
export const IMAGE_CACHE_CONTROL = '315360000';
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export type ImageKind = 'dish' | 'recipe' | 'ingredient';

export const IMAGE_KINDS: readonly ImageKind[] = ['dish', 'recipe', 'ingredient'];

export function isImageKind(value: unknown): value is ImageKind {
  return typeof value === 'string' && (IMAGE_KINDS as readonly string[]).includes(value);
}

export function imageMediaType(contentType: string | null | undefined): string | null {
  const value = (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase();
  return value && value in EXTENSIONS ? value : null;
}

export function imageExtension(contentType: string | null | undefined): string | null {
  const type = imageMediaType(contentType);
  return type ? (EXTENSIONS[type] ?? null) : null;
}

export function folderFor(kind: ImageKind): string {
  return kind === 'dish' ? 'dishes' : kind === 'recipe' ? 'recipes' : 'ingredients';
}

/** `dishes/carbonara.<sha8>.jpg` — never derived from user input beyond the key. */
export function storedImagePath(
  kind: ImageKind,
  key: string,
  sha256: string,
  contentType: string | null | undefined,
): string {
  const slug = key
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  const hash = sha256
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
    .slice(0, 8);
  const extension = imageExtension(contentType);
  if (!slug) throw new Error('Image key is empty.');
  if (hash.length !== 8) throw new Error('Content hash must have at least 8 hex characters.');
  if (!extension) throw new Error(`Unsupported image type: ${contentType ?? 'unknown'}`);
  return `${folderFor(kind)}/${slug}.${hash}.${extension}`;
}

/** The fixed legacy path an installed app may still reference. */
export function legacyImagePath(kind: ImageKind, file: string): string {
  const cleaned = file.replace(/^\/+/, '').replace(/\.\./g, '');
  if (cleaned.startsWith(`${folderFor(kind)}/`)) return cleaned;
  return `${folderFor(kind)}/${cleaned.replace(/^.*\//, '')}`;
}

export function parseRecacheOptions(value: unknown): {
  keys: string[] | null;
  kinds: ImageKind[] | null;
  force: boolean;
  limit: number;
  dryRun: boolean;
  rows: Array<{
    kind: ImageKind;
    key: string;
    sourceUrl: string;
    sourcePage: string | null;
    license: string | null;
    attribution: string | null;
    verified: boolean;
  }>;
} {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const keys = Array.isArray(record.keys)
    ? record.keys.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim() !== '',
      )
    : [];
  const kinds = Array.isArray(record.kinds)
    ? record.kinds.filter(isImageKind)
    : isImageKind(record.kind)
      ? [record.kind]
      : [];
  const requested = Number(record.limit);
  const limit = Number.isFinite(requested)
    ? Math.min(1000, Math.max(1, Math.trunc(requested)))
    : 200;
  const rows = Array.isArray(record.rows)
    ? record.rows.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        if (!isImageKind(row.kind) || typeof row.key !== 'string' || !row.key.trim()) return [];
        if (typeof row.source_url !== 'string' || !/^https?:\/\//i.test(row.source_url)) return [];
        return [
          {
            kind: row.kind,
            key: row.key.trim(),
            sourceUrl: row.source_url.trim(),
            sourcePage: typeof row.source_page === 'string' ? row.source_page : null,
            license: typeof row.license === 'string' ? row.license : null,
            attribution: typeof row.attribution === 'string' ? row.attribution : null,
            verified: row.verified === true,
          },
        ];
      })
    : [];
  return {
    keys: keys.length ? [...new Set(keys)] : null,
    kinds: kinds.length ? [...new Set(kinds)] : null,
    force: record.force === true,
    limit,
    dryRun: record.dry_run === true,
    rows,
  };
}

/** Reject a source whose URL points at a private network or a file scheme. */
export function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\]$)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}
