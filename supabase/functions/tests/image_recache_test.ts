import { assert, assertEquals, assertFalse, assertThrows } from 'jsr:@std/assert@1';

import {
  folderFor,
  imageExtension,
  imageMediaType,
  isImageKind,
  isPublicHttpUrl,
  legacyImagePath,
  parseRecacheOptions,
  storedImagePath,
} from '../_shared/image-recache.ts';

Deno.test('storedImagePath is content addressed and sanitized', () => {
  assertEquals(
    storedImagePath('dish', 'Spaghetti Carbonara', 'a1b2c3d4e5f6', 'image/webp'),
    'dishes/spaghetti-carbonara.a1b2c3d4.webp',
  );
  assertEquals(
    storedImagePath('recipe', 'creme_brulee', 'ABCDEF01', 'image/jpeg; charset=binary'),
    'recipes/creme-brulee.abcdef01.jpg',
  );
  assertEquals(
    storedImagePath('ingredient', 'garlic', '00112233', 'image/png'),
    'ingredients/garlic.00112233.png',
  );
  assertThrows(() => storedImagePath('dish', '   ', 'a1b2c3d4', 'image/webp'));
  assertThrows(() => storedImagePath('dish', 'ramen', 'abc', 'image/webp'));
  assertThrows(() => storedImagePath('dish', 'ramen', 'a1b2c3d4', 'text/html'));
});

Deno.test('folderFor and media helpers agree', () => {
  assertEquals(folderFor('dish'), 'dishes');
  assertEquals(folderFor('recipe'), 'recipes');
  assertEquals(folderFor('ingredient'), 'ingredients');
  assertEquals(imageMediaType('IMAGE/JPEG; charset=binary'), 'image/jpeg');
  assertEquals(imageExtension('image/pjpeg'), 'jpg');
  assertEquals(imageExtension('image/svg+xml'), null);
  assert(isImageKind('dish'));
  assertFalse(isImageKind('user'));
});

Deno.test('legacyImagePath keeps old fixed-path objects working', () => {
  assertEquals(legacyImagePath('dish', 'dishes/shrimp_alfredo.webp'), 'dishes/shrimp_alfredo.webp');
  assertEquals(legacyImagePath('dish', '/shrimp_alfredo.webp'), 'dishes/shrimp_alfredo.webp');
  assertEquals(legacyImagePath('recipe', 'recipes/carbonara.jpg'), 'recipes/carbonara.jpg');
  assertEquals(legacyImagePath('ingredient', 'ingredients/garlic.jpg'), 'ingredients/garlic.jpg');
});

Deno.test('parseRecacheOptions applies safe defaults', () => {
  const options = parseRecacheOptions(null);
  assertEquals(options.keys, null);
  assertEquals(options.kinds, null);
  assertEquals(options.force, false);
  assertEquals(options.dryRun, false);
  assertEquals(options.limit, 200);
  assertEquals(options.rows, []);
});

Deno.test('parseRecacheOptions validates filters and rows', () => {
  const options = parseRecacheOptions({
    keys: ['ramen', '  ', 5, 'ramen'],
    kinds: ['dish', 'bogus', 'recipe'],
    kind: 'ingredient',
    force: true,
    dry_run: true,
    limit: 5000,
    rows: [
      {
        kind: 'dish',
        key: 'ramen',
        source_url: 'https://example.test/ramen.webp',
        source_page: 'https://example.test/ramen',
        license: 'CC0',
        verified: true,
      },
      { kind: 'user', key: 'x', source_url: 'https://example.test/x.webp' },
      { kind: 'dish', key: '', source_url: 'https://example.test/x.webp' },
      { kind: 'dish', key: 'x', source_url: 'file:///etc/passwd' },
      'not-an-object',
    ],
  });
  assertEquals(options.keys, ['ramen']);
  assertEquals(options.kinds, ['dish', 'recipe']);
  assertEquals(options.limit, 1000);
  assert(options.force);
  assert(options.dryRun);
  assertEquals(options.rows.length, 1);
  const [row] = options.rows;
  assert(row);
  assertEquals(row.key, 'ramen');
  assertEquals(row.verified, true);
});

Deno.test('isPublicHttpUrl blocks local and private sources', () => {
  assert(isPublicHttpUrl('https://upload.wikimedia.org/wikipedia/commons/a/a8/Corn_Bread_1A.jpg'));
  assert(isPublicHttpUrl('http://example.com/photo.jpg'));
  for (const url of [
    'file:///etc/passwd',
    'http://localhost:54321/x.jpg',
    'http://127.0.0.1/x.jpg',
    'http://10.0.0.1/x.jpg',
    'http://192.168.1.2/x.jpg',
    'http://172.16.0.1/x.jpg',
    'http://169.254.169.254/latest/meta-data',
    'http://printer.local/x.jpg',
    'not a url',
  ]) {
    assertFalse(isPublicHttpUrl(url), url);
  }
});

Deno.test('every catalog photo has a matching content-hashed storage path', async () => {
  const catalog = (await import('../../../dish-catalog.json', { with: { type: 'json' } }))
    .default as {
    dishes: Array<{
      key: string;
      files?: Array<{ file: string; sha256: string; source_url: string; verified: boolean }>;
    }>;
  };
  assert(catalog.dishes.length >= 400);
  for (const dish of catalog.dishes) {
    const file = dish.files?.[0];
    assert(file, `${dish.key} has no photo`);
    assert(file.source_url.startsWith('https://'), `${dish.key} source is not https`);
    assert(isPublicHttpUrl(file.source_url), `${dish.key} source is not public`);
    assert(file.verified, `${dish.key} was not visually verified`);
    const expected = storedImagePath('dish', dish.key, file.sha256, 'image/webp');
    if (file.file !== expected) {
      // Reused group photo: the object is named after the dish it came from.
      const shared = (file as { shared_with?: string }).shared_with;
      assert(shared, `${dish.key} -> ${file.file} is not content addressed`);
      assertEquals(file.file, storedImagePath('dish', shared, file.sha256, 'image/webp'), dish.key);
    }
  }
});
