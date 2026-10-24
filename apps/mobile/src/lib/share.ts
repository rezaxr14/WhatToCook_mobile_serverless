import { Share } from 'react-native';

export interface ShareRecipeInput {
  name: string;
  description?: string;
  /** Deep link (`whattocook://...`) so the recipient can open the recipe in the app. */
  url?: string;
}

/**
 * Open the native share sheet with a recipe summary and a deep link.
 * Failures (for example when the user dismisses the sheet) are ignored: sharing
 * is a convenience, never a blocking action.
 */
export async function shareRecipe({ name, description, url }: ShareRecipeInput): Promise<boolean> {
  const message = [name, description, url].filter((part) => Boolean(part?.trim())).join('\n\n');

  try {
    const result = await Share.share({ title: name, message });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
