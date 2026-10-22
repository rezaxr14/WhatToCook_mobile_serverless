import { assertEquals } from 'jsr:@std/assert@1';
import {
  buildCatalogIndex,
  mapDetectedIngredients,
  type DetectedIngredient,
} from '../_shared/catalog.ts';
import { TEST_CATALOG } from './test_harness.ts';

const detections: DetectedIngredient[] = [
  { name: 'Eggs', category: 'Dairy & Eggs', confidence: 0.9 },
  { name: 'egg', category: 'Dairy & Eggs', confidence: 0.8 },
  { name: 'tomatoes', category: 'Produce', confidence: 0.85 },
  { name: 'Dragon Fruit', category: 'Produce', confidence: 0.91 },
  { name: 'Süt', category: 'Dairy & Eggs', confidence: 0.7 },
];

Deno.test('catalog: matches singular/plural and localized names', () => {
  const index = buildCatalogIndex(TEST_CATALOG);
  assertEquals(index.get('eggs')?.id, 1);
  assertEquals(index.get('tomato')?.id, 2);
  assertEquals(index.get('tomatoes')?.id, 2);
  assertEquals(index.get('süt')?.id, 3);
});

Deno.test('catalog: maps detections, deduplicates, localizes, and keeps unmatched rows', () => {
  const mapped = mapDetectedIngredients({
    detections,
    catalog: TEST_CATALOG,
    locale: 'tr',
    minConfidence: 0.5,
    maxItems: 10,
  });

  assertEquals(mapped.length, 4);
  const eggs = mapped.filter((item) => item.ingredient_id === 1);
  assertEquals(eggs.length, 1);
  assertEquals(eggs[0]!.confidence, 0.9);
  assertEquals(eggs[0]!.display_name, 'Yumurta');

  const tomatoes = mapped.find((item) => item.ingredient_id === 2);
  assertEquals(tomatoes?.matched, true);
  assertEquals(tomatoes?.display_name, 'Domates');

  const dragonFruit = mapped.find((item) => item.name === 'Dragon Fruit');
  assertEquals(dragonFruit?.matched, false);
  assertEquals(dragonFruit?.ingredient_id, null);
  assertEquals(dragonFruit?.display_name, 'Dragon Fruit');

  const milk = mapped.find((item) => item.ingredient_id === 3);
  assertEquals(milk?.display_name, 'Süt');
});

Deno.test('catalog: filters low confidence and respects maxItems', () => {
  const filtered = mapDetectedIngredients({
    detections: [
      ...detections,
      { name: 'Ghost Pepper', category: 'Produce', confidence: 0.2 },
    ],
    catalog: TEST_CATALOG,
    locale: 'en',
    minConfidence: 0.8,
    maxItems: 2,
  });

  assertEquals(filtered.length, 2);
  assertEquals(filtered[0]!.confidence >= 0.8, true);
  assertEquals(filtered[1]!.confidence >= 0.8, true);
});
