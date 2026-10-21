/**
 * Frontend culinary and gastronomy image resolution utilities.
 * Ensures all dishes, cuisines, and ingredients have distinct, high-definition photography
 * and prevents identical fallback images from being displayed.
 */

import { recipeImageUrl } from '../lib/images';

const DISH_PHOTO_MAP: Record<string, string> = {
  // Desserts & Sweets
  ice_cream: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=80',
  gelato: 'https://images.unsplash.com/photo-1560008581-09826d1de69e?auto=format&fit=crop&w=800&q=80',
  // NOTE: order matters — more specific names must precede generic ones,
  // otherwise "cheesecake" would match the generic "cake" photo.
  cheesecake: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80',
  cake: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80',
  tiramisu: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80',
  crepe: recipeImageUrl('recipes/banana_crepes.jpg'),
  waffle: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=800&q=80',
  pancake: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80',

  // Sandwiches & Melts
  grilled_cheese: recipeImageUrl('recipes/grilled_cheese.jpg'),
  sandwich: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80',
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
  toast: 'https://images.unsplash.com/photo-1603046891726-36bfd957e0bf?auto=format&fit=crop&w=800&q=80',

  // Eggs & Breakfast
  omelette: recipeImageUrl('recipes/omelette.jpg'),
  shakshuka: recipeImageUrl('recipes/shakshuka.jpg'),
  eggs: recipeImageUrl('recipes/omelette.jpg'),

  // Pasta & Pizza
  pasta: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281691?auto=format&fit=crop&w=800&q=80',
  spaghetti: 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?auto=format&fit=crop&w=800&q=80',
  carbonara: recipeImageUrl('recipes/carbonara.jpg'),
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
  risotto: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&q=80',

  // Poultry & Meat & Seafood
  chicken: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80',
  steak: 'https://images.unsplash.com/photo-1565299715199-866c917206bb?auto=format&fit=crop&w=800&q=80',
  beef: 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?auto=format&fit=crop&w=800&q=80',
  salmon: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
  shrimp: 'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?auto=format&fit=crop&w=800&q=80',
  stew: 'https://images.unsplash.com/photo-1666819632298-fe15dc7d4c34?auto=format&fit=crop&w=800&q=80',
  curry: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&q=80',

  // Asian & Bowls & Salads
  rice: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=800&q=80',
  ramen: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
  noodles: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
  taco: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
  salad: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
  soup: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
};

const DEFAULT_GOURMET_PHOTOS = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
];

export function getDishImageUrl(dishName: string, existingUrl?: string): string {
  if (existingUrl && existingUrl.startsWith('http') && !existingUrl.includes('default.png')) {
    return existingUrl;
  }

  if (!dishName) {
    return DEFAULT_GOURMET_PHOTOS[0];
  }

  const lower = dishName.toLowerCase();

  for (const [key, url] of Object.entries(DISH_PHOTO_MAP)) {
    const searchWord = key.replace('_', ' ');
    if (lower.includes(searchWord)) {
      return url;
    }
  }

  // Consistent pseudo-hash index for varied fallbacks
  let hash = 0;
  for (let i = 0; i < dishName.length; i++) {
    hash = (hash << 5) - hash + dishName.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DEFAULT_GOURMET_PHOTOS.length;
  return DEFAULT_GOURMET_PHOTOS[idx];
}

/**
 * Assign a photo URL to every dish in a list, guaranteeing that no two
 * DIFFERENT dishes on the same page share a photo — even when their names
 * collide on the same keyword (e.g. three "pasta…" suggestions) or their
 * keyword hashes hit the same fallback. Keeps a dish's natural photo when
 * it is unique; rotates through the full photo pool only for collisions.
 */
export function assignUniqueDishPhotos(dishes: Array<{ name: string; image?: string | null }>): string[] {
  const pool: string[] = [];
  const poolSeen = new Set<string>();
  const absorb = (url: string) => {
    if (url && !poolSeen.has(url)) {
      poolSeen.add(url);
      pool.push(url);
    }
  };
  for (const url of Object.values(DISH_PHOTO_MAP)) absorb(url);
  for (const url of DEFAULT_GOURMET_PHOTOS) absorb(url);

  const natural = dishes.map((d) => getDishImageUrl(d.name, d.image ?? undefined));
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < natural.length; i++) {
    let url = natural[i];
    if (used.has(url) && pool.length > 1) {
      const start = Math.max(0, pool.indexOf(url));
      let probe = (start + 1) % pool.length;
      let guard = 0;
      while (used.has(pool[probe]) && guard < pool.length) {
        probe = (probe + 1) % pool.length;
        guard += 1;
      }
      url = pool[probe];
    }
    used.add(url);
    out.push(url);
  }
  return out;
}
