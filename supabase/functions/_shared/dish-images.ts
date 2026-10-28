/**
 * Server-side dish photography.
 *
 * AI models do not return reliable photo URLs, so the gateway assigns a real
 * food photo from the public `recipe-images` Storage bucket before the
 * response is cached. Both clients can therefore render `image` directly.
 */

import {
  assignDishPhotoFiles,
  matchDishPhoto,
  pickDishPhoto,
  type DishPhotoSubject,
} from '../../../packages/shared/src/dish-photos.ts';

type ImageUrl = (file: string) => string;

interface DishLike extends DishPhotoSubject {
  image?: string;
  [key: string]: unknown;
}

/** Attach Storage photo URLs to a suggestions array, preserving all fields. */
export function attachSuggestionImages<T>(data: T, imageUrl: ImageUrl): T {
  if (!Array.isArray(data)) return data;
  const dishes = data.filter(
    (entry): entry is DishLike =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as { name?: unknown }).name === 'string',
  );
  if (dishes.length !== data.length || dishes.length === 0) return data;

  const files = assignDishPhotoFiles(dishes);
  return dishes.map((dish, index) => ({
    ...dish,
    image: imageUrl(files[index]!),
  })) as unknown as T;
}

/** Attach one Storage photo URL to a recipe-detail object. */
export function attachDetailImage<T>(data: T, imageUrl: ImageUrl): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const dish = data as unknown as DishLike;
  if (typeof dish.name !== 'string' || !dish.name.trim()) return data;
  const file = matchDishPhoto(dish) ?? pickDishPhoto(dish.name);
  return { ...dish, image: imageUrl(file) } as unknown as T;
}
