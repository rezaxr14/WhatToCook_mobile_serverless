/**
 * Ingredient photo lookup lives in `@whattocook/shared` so the web client, the
 * mobile app and the `cache-ingredient-images` Edge Function all resolve the
 * same source URL for a given ingredient name.
 */
export {
  DEFAULT_INGREDIENT_IMAGE,
  INGREDIENT_IMAGE_MAP,
  ingredientImageUrl,
} from '@whattocook/shared/ingredient-images';
