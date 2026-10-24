/**
 * Public Storage image helpers.
 *
 * Catalog recipe photos are stored in the public `recipe-images` bucket at
 * paths such as `recipes/carbonara.jpg`. The reference app served these from
 * Django's `/media/`; the static web client resolves the same paths through
 * Supabase Storage instead.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');

export const DEFAULT_RECIPE_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80';

export function storagePublicUrl(bucket: string, path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  const encoded = cleanPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}

/**
 * Ingredient thumbnails are cached by the `cache-ingredient-images` Edge
 * Function in the public `ingredient-images` bucket. Paths are content-hashed
 * (`ingredients/<slug>-<hash>.jpg`), so long-lived immutable caching is safe.
 */
export function ingredientStorageUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/media/')) {
    return storagePublicUrl('ingredient-images', pathOrUrl.replace(/^\/media\//, ''));
  }
  return storagePublicUrl('ingredient-images', pathOrUrl.replace(/^\/+/, ''));
}

export function recipeImageUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return DEFAULT_RECIPE_IMAGE;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/media/recipes/')) {
    return storagePublicUrl('recipe-images', `recipes/${pathOrUrl.split('/').pop()}`);
  }
  if (pathOrUrl.startsWith('/media/')) {
    return storagePublicUrl('recipe-images', pathOrUrl.replace(/^\/media\//, ''));
  }
  if (pathOrUrl.startsWith('/')) return pathOrUrl;
  return storagePublicUrl('recipe-images', pathOrUrl);
}
