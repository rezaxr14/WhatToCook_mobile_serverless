import { assert, assertEquals, assertFalse, assertThrows } from 'jsr:@std/assert@1';

import { ingredientImageUrl } from '../../../packages/shared/src/ingredient-images.ts';
import {
  bearerToken,
  ingredientObjectPath,
  isManagedIngredientPath,
  mediaType,
  secretMatches,
} from '../_shared/ingredient-cache.ts';

Deno.test('ingredientObjectPath is content addressed and safe', () => {
  assertEquals(
    ingredientObjectPath('bell-pepper', 'a1b2c3d4e5f60718', 'image/jpeg'),
    'ingredients/bell-pepper-a1b2c3d4e5f60718.jpg',
  );
  assertEquals(
    ingredientObjectPath('Green Onion!', 'ABCDEF0123456789', 'image/webp; charset=binary'),
    'ingredients/green-onion-abcdef0123456789.webp',
  );
  assertThrows(() => ingredientObjectPath('', 'a1b2c3d4', 'image/jpeg'));
  assertThrows(() => ingredientObjectPath('garlic', 'a1b2c3d4', 'text/html'));
});

Deno.test('mediaType normalizes parameters and rejects non-images', () => {
  assertEquals(mediaType('IMAGE/JPEG; charset=binary'), 'image/jpeg');
  assertEquals(mediaType('image/avif'), 'image/avif');
  assertEquals(mediaType('text/html'), null);
  assertEquals(mediaType(null), null);
});

Deno.test('isManagedIngredientPath only accepts the cached prefix', () => {
  assert(isManagedIngredientPath('ingredients/garlic-abc123.jpg'));
  assertFalse(isManagedIngredientPath('recipes/garlic.jpg'));
  assertFalse(isManagedIngredientPath('ingredients/../recipes/x.jpg'));
  assertFalse(isManagedIngredientPath(null));
});

Deno.test('bearerToken parses the authorization header', () => {
  const request = new Request('https://example.test', {
    headers: { Authorization: 'Bearer secret-value' },
  });
  assertEquals(bearerToken(request), 'secret-value');
  assertEquals(bearerToken(new Request('https://example.test')), '');
});

Deno.test('secretMatches compares without leaking length', async () => {
  assert(await secretMatches('same-secret', 'same-secret'));
  assertFalse(await secretMatches('same-secret', 'other-secret'));
  assertFalse(await secretMatches('', 'same-secret'));
});

Deno.test('every catalog ingredient resolves to a curated source photo', () => {
  for (const slug of ['garlic', 'bell-pepper', 'chicken-breast', 'greek-yogurt']) {
    const url = ingredientImageUrl(slug);
    assert(url.startsWith('https://images.unsplash.com/'), `${slug} -> ${url}`);
  }
});
