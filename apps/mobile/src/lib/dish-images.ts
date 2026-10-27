/**
 * Dish photography resolution shared with the web client.
 *
 * Every AI suggestion gets a real food photo from the public Supabase
 * `recipe-images` bucket — the same origin the rest of the app already talks
 * to — instead of a random stock host that may be blocked. A deterministic
 * local poster is drawn by `DishImage` only when that photo fails to load.
 */

import {
  assignDishPhotoFiles,
  matchDishPhoto,
  pickDishPhoto,
  type DishPhotoSubject,
} from '@whattocook/shared';

import { recipeImageUrl } from '@/lib/catalog';

export interface DishImageSubject extends DishPhotoSubject {
  image?: string | null;
}

function isRemotePhoto(url: string | null | undefined): url is string {
  return !!url && url.startsWith('http') && !url.includes('default.png');
}

export function getDishImageUrl(dishName: string, existingUrl?: string, cuisine?: string): string {
  if (isRemotePhoto(existingUrl)) return existingUrl;

  const file = matchDishPhoto({ name: dishName, cuisine }) ?? pickDishPhoto(dishName || 'dish');
  return recipeImageUrl(file);
}

/**
 * One distinct photo per dish on a screen. A provider-supplied photo wins when
 * it is unique; otherwise the shared matcher picks a Storage photo and rotates
 * the pool so no two cards look the same.
 */
export function assignUniqueDishPhotos(dishes: readonly DishImageSubject[]): string[] {
  const files = assignDishPhotoFiles(dishes);
  const used = new Set<string>();

  return dishes.map((dish, index) => {
    const storageUrl = recipeImageUrl(files[index]);
    if (isRemotePhoto(dish.image) && !used.has(dish.image)) {
      used.add(dish.image);
      return dish.image;
    }
    used.add(storageUrl);
    return storageUrl;
  });
}
