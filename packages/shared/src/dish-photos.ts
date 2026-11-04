/**
 * Dish photography shared by the web, mobile and Edge Function code.
 *
 * Two layers:
 *  - `DISH_CATALOG` (generated from `dish-catalog.json`) names about 400 dishes
 *    in five languages, with a photo when one was verified.
 *  - `BASE_DISH_PHOTOS` is the small hand-written pool of broad food photos
 *    (plus their generic keywords) that gives every unknown dish something
 *    plausible to show.
 *
 * Matching is precedence-first, then longest-phrase: the provider hint wins
 * over the dish name, which wins over the cuisine; inside a field the longest
 * whole-word keyword wins, and ties keep table order. A whole-word, Unicode
 * boundary stops "egg" from matching "eggplant".
 */

import { DISH_CATALOG, type CatalogDish } from './dish-catalog.ts';

export type DishPhotoGroup =
  | 'pasta'
  | 'seafood'
  | 'grill'
  | 'meat'
  | 'soup'
  | 'veg'
  | 'rice'
  | 'egg'
  | 'salad'
  | 'bread'
  | 'breakfast'
  | 'dessert';

export interface DishPhotoEntry {
  /** Logical path inside the `recipe-images` bucket (mapped by `image-manifest`). */
  file: string;
  /** Lower-case words or phrases that describe the photo. */
  keywords: string[];
  /** Related photos; a collision prefers another member of the same group. */
  group: DishPhotoGroup;
}

/** Broad photos kept for unknown dishes and group collisions. */
const BASE_DISH_PHOTOS: readonly DishPhotoEntry[] = [
  // Pasta and noodles
  { file: 'recipes/carbonara.jpg', keywords: ['carbonara'], group: 'pasta' },
  {
    file: 'recipes/penne_pomodoro.jpg',
    keywords: ['penne', 'pomodoro', 'arrabbiata', 'rigatoni', 'fusilli', 'tomato pasta'],
    group: 'pasta',
  },
  {
    file: 'dishes/shrimp_alfredo.webp',
    keywords: [
      'shrimp alfredo',
      'prawn alfredo',
      'shrimp pasta',
      'prawn pasta',
      'seafood pasta',
      'creamy pasta',
      'alfredo',
    ],
    group: 'pasta',
  },
  {
    file: 'dishes/spaghetti.webp',
    keywords: [
      'spaghetti',
      'pasta',
      'linguine',
      'macaroni',
      'lasagna',
      'noodle',
      'noodles',
      'ramen',
    ],
    group: 'pasta',
  },

  // Seafood, meat and grills
  { file: 'recipes/garlic_shrimp.jpg', keywords: ['shrimp', 'prawn', 'prawns'], group: 'seafood' },
  {
    file: 'dishes/fish_tacos.webp',
    keywords: ['fish taco', 'fish tacos', 'taco', 'tacos', 'burrito', 'wrap', 'salsa'],
    group: 'seafood',
  },
  {
    file: 'dishes/grilled.webp',
    keywords: ['grilled', 'grill', 'barbecue', 'bbq', 'kebab', 'kabob', 'skewer', 'satay'],
    group: 'grill',
  },
  {
    file: 'dishes/beef.webp',
    keywords: ['steak', 'beef', 'kofta', 'meatball', 'meatballs', 'meat', 'burger'],
    group: 'meat',
  },
  {
    file: 'dishes/chicken.webp',
    keywords: ['roast chicken', 'fried chicken', 'wings', 'drumstick'],
    group: 'meat',
  },
  {
    file: 'recipes/chicken_skillet.jpg',
    keywords: ['chicken', 'poultry', 'tikka', 'shawarma', 'tagine'],
    group: 'meat',
  },

  // Stews, soups and vegetables
  {
    file: 'dishes/lentil_soup.webp',
    keywords: ['soup', 'stew', 'lentil', 'dal', 'dhal', 'broth', 'chowder', 'ghormeh', 'harira'],
    group: 'soup',
  },
  {
    file: 'dishes/stir_fry.webp',
    keywords: [
      'stir fry',
      'stir-fry',
      'stirfry',
      'wok',
      'vegetable',
      'vegetables',
      'veggie',
      'tofu',
      'curry',
    ],
    group: 'veg',
  },
  {
    file: 'dishes/stuffed_peppers.webp',
    keywords: ['stuffed pepper', 'stuffed peppers', 'bell pepper', 'capsicum', 'dolma', 'dolmeh'],
    group: 'veg',
  },
  {
    file: 'dishes/potatoes.webp',
    keywords: ['potato', 'potatoes', 'gratin', 'fries', 'rosti', 'hash brown'],
    group: 'veg',
  },

  // Rice and eggs
  { file: 'dishes/risotto.webp', keywords: ['risotto'], group: 'rice' },
  {
    file: 'recipes/garlic_fried_rice.jpg',
    keywords: ['fried rice', 'rice', 'pilaf', 'pilau', 'biryani', 'paella'],
    group: 'rice',
  },
  {
    file: 'recipes/omelette.jpg',
    keywords: ['omelette', 'omelet', 'eggs', 'egg', 'frittata', 'scrambled'],
    group: 'egg',
  },
  {
    file: 'recipes/shakshuka.jpg',
    keywords: ['shakshuka', 'poached egg', 'menemen'],
    group: 'egg',
  },

  // Salads, sandwiches and bread
  { file: 'dishes/caesar.webp', keywords: ['caesar'], group: 'salad' },
  {
    file: 'dishes/greek_salad.webp',
    keywords: ['greek salad', 'salad', 'tabbouleh', 'fattoush', 'coleslaw', 'slaw'],
    group: 'salad',
  },
  {
    file: 'recipes/avocado_toast.jpg',
    keywords: ['avocado', 'toast', 'bruschetta', 'tartine', 'crostini'],
    group: 'bread',
  },
  {
    file: 'recipes/grilled_cheese.jpg',
    keywords: ['grilled cheese', 'sandwich', 'melt', 'toastie', 'panini'],
    group: 'bread',
  },
  {
    file: 'dishes/garlic_bread.webp',
    keywords: ['garlic bread', 'bread', 'garlic toast', 'focaccia', 'baguette'],
    group: 'bread',
  },

  // Breakfast and sweets
  {
    file: 'recipes/pancakes.jpg',
    keywords: ['pancake', 'pancakes', 'waffle', 'waffles', 'french toast'],
    group: 'breakfast',
  },
  {
    file: 'recipes/banana_crepes.jpg',
    keywords: ['crepe', 'crepes', 'palatschinken'],
    group: 'breakfast',
  },
  {
    file: 'dishes/chocolate.webp',
    keywords: [
      'chocolate',
      'cake',
      'brownie',
      'birthday',
      'dessert',
      'tiramisu',
      'cheesecake',
      'pudding',
    ],
    group: 'dessert',
  },
  {
    file: 'recipes/affogato.jpg',
    keywords: ['affogato', 'coffee', 'espresso', 'ice cream', 'gelato'],
    group: 'dessert',
  },
];

/**
 * Dishes whose catalog entry deliberately has no photo: the base pool's
 * generic keyword already points at the intended photo (for example Menemen
 * uses the shakshuka photo). The catalog still names these dishes in five
 * languages, so localized matching works, but the legacy photo wins.
 */
const USE_BASE_PHOTO = new Set([
  'menemen',
  'shakshuka',
  'spaghetti-carbonara',
  'shrimp-alfredo',
  'caesar-salad',
  'greek-salad',
]);

const STOP_WORDS = new Set(['and', 'with', 'the', 'a', 'al', 'la', 'de', 'of', 'in']);

function nameTokens(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

/**
 * Keep catalog keywords that actually describe the dish. Translation
 * subagents also emitted broad descriptors ("beef stew", "one pot"), which
 * would otherwise hijack every generic request; the base pool owns those.
 */
function specificKeywords(dish: CatalogDish): string[] {
  const tokens = new Set(nameTokens(dish.names.en));
  const minimum = Math.max(1, tokens.size);
  return dish.keywords
    .map(normalizeText)
    .filter((keyword) => keyword.length >= 3)
    .filter((keyword) => keyword.split(' ').length >= minimum)
    .filter((keyword) => keyword.split(' ').some((part) => tokens.has(part)));
}

const CATALOG_PHOTOS: readonly DishPhotoEntry[] = DISH_CATALOG.filter(
  (dish): dish is CatalogDish & { photo: string } =>
    Boolean(dish.photo) && !USE_BASE_PHOTO.has(dish.key),
).map((dish) => ({
  // The dish's own names are specific phrases in every language; only the
  // dish-scoped extras are added. `DISH_GROUP_KEYWORDS` is exported for
  // tooling, never used for matching.
  file: dish.photo,
  keywords: [...Object.values(dish.names), ...specificKeywords(dish)]
    .map(normalizeText)
    .filter((value) => value.length >= 3),
  group: dish.group as DishPhotoGroup,
}));

/** Specific catalog photos first, then the broad pool. */
export const DISH_PHOTOS: readonly DishPhotoEntry[] = [...CATALOG_PHOTOS, ...BASE_DISH_PHOTOS];

export const DISH_PHOTO_FILES: readonly string[] = [
  ...new Set(DISH_PHOTOS.map((entry) => entry.file)),
];

/** Fallback chosen when only the cuisine is recognisable. */
const CUISINE_PHOTOS: Record<string, string> = {
  persian: 'dishes/lentil_soup.webp',
  iranian: 'dishes/lentil_soup.webp',
  turkish: 'dishes/grilled.webp',
  arabic: 'dishes/grilled.webp',
  lebanese: 'dishes/greek_salad.webp',
  mediterranean: 'dishes/greek_salad.webp',
  greek: 'dishes/greek_salad.webp',
  italian: 'recipes/penne_pomodoro.jpg',
  french: 'recipes/banana_crepes.jpg',
  indian: 'dishes/stir_fry.webp',
  pakistani: 'dishes/stir_fry.webp',
  thai: 'dishes/stir_fry.webp',
  chinese: 'dishes/stir_fry.webp',
  japanese: 'dishes/stir_fry.webp',
  korean: 'dishes/stir_fry.webp',
  asian: 'dishes/stir_fry.webp',
  'east-asian': 'dishes/stir_fry.webp',
  'southeast-asian': 'dishes/stir_fry.webp',
  mexican: 'dishes/fish_tacos.webp',
  spanish: 'dishes/shrimp_alfredo.webp',
  american: 'dishes/beef.webp',
  british: 'dishes/potatoes.webp',
  german: 'dishes/potatoes.webp',
  breakfast: 'recipes/pancakes.jpg',
  dessert: 'dishes/chocolate.webp',
};

/**
 * Lower-case, strip diacritics and unify Persian/Arabic variants so `ي/ی` and
 * `ك/ک` match the same entry. ZWNJ becomes a space, not nothing, so
 * "قرمه‌سبزی" still contains the phrase "قرمه سبزی".
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u064a\u0649]/g, '\u06cc')
    .replace(/\u0643/g, '\u06a9')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(haystack: string, keyword: string): boolean {
  const escaped = escapeRegExp(keyword);
  // Unicode-aware whole-word boundaries: `egg` must not match `eggplant`.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(haystack);
}

function bestMatch(field: string): string | null {
  const haystack = normalizeText(field);
  if (!haystack) return null;
  let best: { length: number; file: string } | null = null;
  for (const entry of DISH_PHOTOS) {
    for (const keyword of entry.keywords) {
      if (keyword.length < 3) continue;
      if (!containsPhrase(haystack, keyword)) continue;
      if (!best || keyword.length > best.length)
        best = { length: keyword.length, file: entry.file };
    }
  }
  return best?.file ?? null;
}

function hash(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
}

function groupOf(file: string): DishPhotoGroup | undefined {
  return DISH_PHOTOS.find((entry) => entry.file === file)?.group;
}

export interface DishPhotoSubject {
  name: string;
  image_hint?: string | null;
  cuisine?: string | null;
}

/**
 * Best photo for a dish, or `null` when nothing matches. Callers usually fall
 * back to {@link pickDishPhoto} so the card still shows food.
 */
export function matchDishPhoto(subject: DishPhotoSubject): string | null {
  const hint = subject.image_hint?.trim();
  if (hint) {
    const match = bestMatch(hint);
    if (match) return match;
  }

  const name = subject.name?.trim();
  if (name) {
    const match = bestMatch(name);
    if (match) return match;
  }

  const cuisine = subject.cuisine?.trim();
  if (cuisine) {
    const fromCuisine = bestMatch(cuisine);
    if (fromCuisine) return fromCuisine;
    const key = Object.keys(CUISINE_PHOTOS).find((entry) => normalizeText(cuisine).includes(entry));
    if (key) return CUISINE_PHOTOS[key]!;
  }

  return null;
}

/** Stable food photo for a dish with no recognisable keyword. */
export function pickDishPhoto(seed: string): string {
  return DISH_PHOTO_FILES[hash(seed || 'dish') % DISH_PHOTO_FILES.length]!;
}

/**
 * One photo per dish on a screen. Matched photos keep priority; a collision
 * picks another photo from the same food group first, so a second pasta still
 * looks like pasta. If the group is exhausted we reuse the best match instead
 * of rotating into an unrelated dish (a tomato pasta must never show shrimp).
 */
export function assignDishPhotoFiles(subjects: readonly DishPhotoSubject[]): string[] {
  const used = new Set<string>();

  return subjects.map((subject) => {
    const natural = matchDishPhoto(subject) ?? pickDishPhoto(subject.name || 'dish');
    if (!used.has(natural)) {
      used.add(natural);
      return natural;
    }

    const siblings = DISH_PHOTOS.filter(
      (entry) => entry.group === groupOf(natural) && !used.has(entry.file),
    );
    if (siblings.length > 0) {
      const choice = siblings[hash(subject.name || natural) % siblings.length]!.file;
      used.add(choice);
      return choice;
    }

    // Same group exhausted: a duplicate photo is far better than a photo of a
    // different dish. Returning `natural` also guarantees a real food image.
    return natural;
  });
}
