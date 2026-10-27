/**
 * Dish photography shared by the web and mobile clients.
 *
 * AI suggestions have no reliable photo of their own, and public stock hosts
 * are blocked on some networks. Every entry below points at a photo in the
 * public `recipe-images` Storage bucket, next to the catalog recipes, so the
 * clients only depend on the Supabase origin they already use.
 *
 * Order matters: specific dish words must come before generic ones
 * ("carbonara" before "pasta", "shrimp alfredo" before "shrimp").
 */

export interface DishPhotoEntry {
  /** Path inside the `recipe-images` bucket. */
  file: string;
  /** Lower-case words or phrases that describe the photo. */
  keywords: string[];
}

export const DISH_PHOTOS: readonly DishPhotoEntry[] = [
  // Pasta and noodles
  { file: 'recipes/carbonara.jpg', keywords: ['carbonara'] },
  {
    file: 'recipes/penne_pomodoro.jpg',
    keywords: ['penne', 'pomodoro', 'arrabbiata', 'rigatoni', 'fusilli', 'tomato pasta'],
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
  },
  {
    file: 'recipes/spaghetti.jpg',
    keywords: ['spaghetti', 'pasta', 'linguine', 'macaroni', 'lasagna', 'noodle', 'noodles', 'ramen'],
  },

  // Seafood, meat and grills
  { file: 'recipes/garlic_shrimp.jpg', keywords: ['shrimp', 'prawn', 'prawns'] },
  {
    file: 'dishes/fish_tacos.webp',
    keywords: ['fish taco', 'fish tacos', 'taco', 'tacos', 'burrito', 'wrap', 'salsa'],
  },
  {
    file: 'dishes/grilled.webp',
    keywords: ['grilled', 'grill', 'barbecue', 'bbq', 'kebab', 'kabob', 'skewer', 'satay'],
  },
  {
    file: 'dishes/beef.webp',
    keywords: ['steak', 'beef', 'kofta', 'meatball', 'meatballs', 'meat', 'burger'],
  },
  { file: 'dishes/chicken.webp', keywords: ['roast chicken', 'fried chicken', 'wings', 'drumstick'] },
  {
    file: 'recipes/chicken_skillet.jpg',
    keywords: ['chicken', 'poultry', 'tikka', 'shawarma', 'tagine'],
  },

  // Stews, soups and vegetables
  {
    file: 'dishes/lentil_soup.webp',
    keywords: ['soup', 'stew', 'lentil', 'dal', 'dhal', 'broth', 'chowder', 'ghormeh', 'harira'],
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
  },
  {
    file: 'dishes/stuffed_peppers.webp',
    keywords: ['stuffed pepper', 'stuffed peppers', 'bell pepper', 'capsicum', 'dolma', 'dolmeh'],
  },
  {
    file: 'dishes/potatoes.webp',
    keywords: ['potato', 'potatoes', 'gratin', 'fries', 'rosti', 'hash brown'],
  },

  // Rice and eggs
  { file: 'dishes/risotto.webp', keywords: ['risotto'] },
  {
    file: 'recipes/garlic_fried_rice.jpg',
    keywords: ['fried rice', 'rice', 'pilaf', 'pilau', 'biryani', 'paella'],
  },
  {
    file: 'recipes/omelette.jpg',
    keywords: ['omelette', 'omelet', 'eggs', 'egg', 'frittata', 'scrambled'],
  },
  {
    file: 'recipes/shakshuka.jpg',
    keywords: ['shakshuka', 'poached egg', 'menemen'],
  },

  // Salads, sandwiches and bread
  { file: 'dishes/caesar.webp', keywords: ['caesar'] },
  {
    file: 'dishes/greek_salad.webp',
    keywords: ['greek salad', 'salad', 'tabbouleh', 'fattoush', 'coleslaw', 'slaw'],
  },
  {
    file: 'recipes/avocado_toast.jpg',
    keywords: ['avocado', 'toast', 'bruschetta', 'tartine', 'crostini'],
  },
  {
    file: 'recipes/grilled_cheese.jpg',
    keywords: ['grilled cheese', 'sandwich', 'melt', 'toastie', 'panini'],
  },
  {
    file: 'dishes/garlic_bread.webp',
    keywords: ['garlic bread', 'bread', 'garlic toast', 'focaccia', 'baguette'],
  },

  // Breakfast and sweets
  {
    file: 'recipes/pancakes.jpg',
    keywords: ['pancake', 'pancakes', 'waffle', 'waffles', 'french toast'],
  },
  { file: 'recipes/banana_crepes.jpg', keywords: ['crepe', 'crepes', 'palatschinken'] },
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
  },
  {
    file: 'recipes/affogato.jpg',
    keywords: ['affogato', 'coffee', 'espresso', 'ice cream', 'gelato'],
  },
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
  mexican: 'dishes/fish_tacos.webp',
  spanish: 'dishes/shrimp_alfredo.webp',
  american: 'dishes/beef.webp',
  british: 'dishes/potatoes.webp',
  german: 'dishes/potatoes.webp',
};

export const DISH_PHOTO_FILES: readonly string[] = DISH_PHOTOS.map((entry) => entry.file);

function matches(haystack: string, keyword: string): boolean {
  // Word boundaries keep "egg" from matching "eggplant" while still allowing
  // hyphens and plurals that are listed explicitly in `keywords`.
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack);
}

function hash(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
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
  const haystack = [subject.image_hint, subject.name, subject.cuisine]
    .filter((value): value is string => !!value && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (!haystack) return null;

  for (const entry of DISH_PHOTOS) {
    if (entry.keywords.some((keyword) => matches(haystack, keyword))) return entry.file;
  }

  const cuisine = subject.cuisine?.trim().toLowerCase();
  if (cuisine) {
    const key = Object.keys(CUISINE_PHOTOS).find((name) => cuisine.includes(name));
    if (key) return CUISINE_PHOTOS[key]!;
  }

  return null;
}

/** Stable food photo for a dish with no recognisable keyword. */
export function pickDishPhoto(seed: string): string {
  return DISH_PHOTO_FILES[hash(seed || 'dish') % DISH_PHOTO_FILES.length]!;
}

/**
 * One distinct photo per dish on a screen. Matched photos keep priority; a
 * collision rotates through the pool so five pasta suggestions do not render
 * the same card five times.
 */
export function assignDishPhotoFiles(subjects: readonly DishPhotoSubject[]): string[] {
  const used = new Set<string>();
  return subjects.map((subject) => {
    const natural = matchDishPhoto(subject) ?? pickDishPhoto(subject.name || 'dish');
    if (!used.has(natural)) {
      used.add(natural);
      return natural;
    }

    const start = Math.max(0, DISH_PHOTO_FILES.indexOf(natural));
    for (let step = 1; step <= DISH_PHOTO_FILES.length; step += 1) {
      const candidate = DISH_PHOTO_FILES[(start + step) % DISH_PHOTO_FILES.length]!;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }

    return natural;
  });
}
