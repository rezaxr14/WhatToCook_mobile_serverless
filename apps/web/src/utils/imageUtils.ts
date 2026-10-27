/**
 * Dish photography resolution for the web client.
 *
 * Photos come from the public Supabase `recipe-images` bucket, the same origin
 * the app already uses, so an AI suggestion never depends on a stock-photo host
 * that may be blocked. A local poster is the last-resort fallback when even
 * Storage fails.
 */

import {
  assignDishPhotoFiles,
  matchDishPhoto,
  pickDishPhoto,
  type DishPhotoSubject,
} from '@whattocook/shared';

import { recipeImageUrl } from '../lib/images';
import { dishPosterDataUri } from '../lib/dish-art';

export interface DishImageSubject extends DishPhotoSubject {
  image?: string | null;
}

function isRemotePhoto(url: string | null | undefined): url is string {
  return !!url && url.startsWith('http') && !url.includes('default.png');
}

/** Local poster for a dish: no network, stable per name. */
export function dishPoster(name: string): string {
  return dishPosterDataUri(name);
}

export function getDishImageUrl(dishName: string, existingUrl?: string, cuisine?: string): string {
  if (isRemotePhoto(existingUrl)) return existingUrl;

  const file = matchDishPhoto({ name: dishName, cuisine }) ?? pickDishPhoto(dishName || 'dish');
  return recipeImageUrl(file);
}

/**
 * Assign a distinct Storage photo to every dish in a list. A provider-supplied
 * photo wins when it is unique; matched photos keep priority and collisions
 * rotate through the pool.
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
