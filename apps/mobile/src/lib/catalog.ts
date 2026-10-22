import { supabaseUrl } from './env';

export { localizeJson } from '@whattocook/shared';

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
