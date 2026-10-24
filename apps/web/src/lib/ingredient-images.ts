/**
 * Curated ingredient photography, ported from the reference Django
 * `find_ingredient_image()` map. The Supabase catalog does not ship ingredient
 * photos, so pantry/search thumbnails resolve through the same name lookup the
 * reference API used instead of showing an empty tile.
 */

export const DEFAULT_INGREDIENT_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';

const INGREDIENT_IMAGE_MAP: Record<string, string> = {
  apple:
    'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=400&q=80',
  avocado:
    'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
  bacon:
    'https://images.unsplash.com/photo-1742859052497-f8bbc8366a32?auto=format&fit=crop&w=400&q=80',
  'baking powder':
    'https://images.unsplash.com/photo-1638405803126-d12de49c7d47?auto=format&fit=crop&w=400&q=80',
  banana:
    'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?auto=format&fit=crop&w=400&q=80',
  basil:
    'https://images.unsplash.com/photo-1683403504056-fd9551b9e666?auto=format&fit=crop&w=400&q=80',
  'beef steak':
    'https://images.unsplash.com/photo-1565299715199-866c917206bb?auto=format&fit=crop&w=400&q=80',
  'bell pepper':
    'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=400&q=80',
  'black pepper':
    'https://images.unsplash.com/photo-1649951806971-ad0e00408773?auto=format&fit=crop&w=400&q=80',
  blueberries:
    'https://images.unsplash.com/photo-1568387022280-92935eb78c5a?auto=format&fit=crop&w=400&q=80',
  bread:
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80',
  broccoli:
    'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=400&q=80',
  'burger buns':
    'https://images.unsplash.com/photo-1632552544552-3ca612a328ac?auto=format&fit=crop&w=400&q=80',
  butter:
    'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=400&q=80',
  'canned tuna':
    'https://images.unsplash.com/photo-1501595091296-3aa970afb3ff?auto=format&fit=crop&w=400&q=80',
  carrot:
    'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=400&q=80',
  celery:
    'https://images.unsplash.com/photo-1716434128739-ddbf5d3a1b7e?auto=format&fit=crop&w=400&q=80',
  'cheddar cheese':
    'https://images.unsplash.com/photo-1618164435735-413d3b066c9a?auto=format&fit=crop&w=400&q=80',
  'chicken breast':
    'https://images.unsplash.com/photo-1682991136736-a2b44623eeba?auto=format&fit=crop&w=400&q=80',
  'chicken thighs':
    'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80',
  chili:
    'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=400&q=80',
  'chili pepper':
    'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=400&q=80',
  'chocolate ice cream':
    'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=400&q=80',
  cilantro:
    'https://images.unsplash.com/photo-1698307982569-b1c440846799?auto=format&fit=crop&w=400&q=80',
  cinnamon:
    'https://images.unsplash.com/photo-1636972955024-3b01f2236b01?auto=format&fit=crop&w=400&q=80',
  'cocoa powder':
    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80',
  'cream cheese':
    'https://images.unsplash.com/photo-1547482610-ae3127053168?auto=format&fit=crop&w=400&q=80',
  cucumber:
    'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?auto=format&fit=crop&w=400&q=80',
  egg: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=400&q=80',
  eggs: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=400&q=80',
  'feta cheese':
    'https://images.unsplash.com/photo-1780092015968-92de2e9dde54?auto=format&fit=crop&w=400&q=80',
  flour:
    'https://images.unsplash.com/photo-1627735483792-233bf632619b?auto=format&fit=crop&w=400&q=80',
  'fresh basil':
    'https://images.unsplash.com/photo-1620706857370-e1b9770e8bb1?auto=format&fit=crop&w=400&q=80',
  garlic:
    'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?auto=format&fit=crop&w=400&q=80',
  ginger:
    'https://images.unsplash.com/photo-1630623093145-f606591c2546?auto=format&fit=crop&w=400&q=80',
  'greek yogurt':
    'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=400&q=80',
  'green onion':
    'https://images.unsplash.com/photo-1559836833-2a2c99b1f54f?auto=format&fit=crop&w=400&q=80',
  'ground beef':
    'https://images.unsplash.com/photo-1612078894671-f11ba41d713e?auto=format&fit=crop&w=400&q=80',
  ham: 'https://images.unsplash.com/photo-1609604820237-4cd9638aa43e?auto=format&fit=crop&w=400&q=80',
  'heavy cream':
    'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
  honey:
    'https://images.unsplash.com/photo-1613548058193-1cd24c1bebcf?auto=format&fit=crop&w=400&q=80',
  'ice cream':
    'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=400&q=80',
  'jasmine rice':
    'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=400&q=80',
  ketchup:
    'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=400&q=80',
  lemon:
    'https://images.unsplash.com/photo-1582287104445-6754664dbdb2?auto=format&fit=crop&w=400&q=80',
  lettuce:
    'https://images.unsplash.com/photo-1640958904159-51ae08bd3412?auto=format&fit=crop&w=400&q=80',
  lime: 'https://images.unsplash.com/photo-1620101680155-b251043b700b?auto=format&fit=crop&w=400&q=80',
  'maple syrup':
    'https://images.unsplash.com/photo-1552314971-d2feb3513949?auto=format&fit=crop&w=400&q=80',
  mayonnaise:
    'https://images.unsplash.com/photo-1584844306864-7035ec5e44f7?auto=format&fit=crop&w=400&q=80',
  milk: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80',
  mozzarella:
    'https://images.unsplash.com/photo-1781567502827-3c671d8cae63?auto=format&fit=crop&w=400&q=80',
  mushroom:
    'https://images.unsplash.com/photo-1512595765784-5ebad80772a3?auto=format&fit=crop&w=400&q=80',
  mushrooms:
    'https://images.unsplash.com/photo-1512595765784-5ebad80772a3?auto=format&fit=crop&w=400&q=80',
  mustard:
    'https://images.unsplash.com/photo-1528750717929-32abb73d3bd9?auto=format&fit=crop&w=400&q=80',
  noodles:
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
  'olive oil':
    'https://images.unsplash.com/photo-1543083477-4f785aeafaa9?auto=format&fit=crop&w=400&q=80',
  onion:
    'https://images.unsplash.com/photo-1518977956812-cd3dbadaaf31?auto=format&fit=crop&w=400&q=80',
  oregano:
    'https://images.unsplash.com/photo-1688633767797-455f59c98272?auto=format&fit=crop&w=400&q=80',
  parmesan:
    'https://images.unsplash.com/photo-1589881133595-a3c085cb731d?auto=format&fit=crop&w=400&q=80',
  pasta:
    'https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=400&q=80',
  'peanut butter':
    'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=400&q=80',
  'pork chop':
    'https://images.unsplash.com/photo-1611059263765-5f57653f3bba3?auto=format&fit=crop&w=400&q=80',
  potato:
    'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  potatoes:
    'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  quinoa:
    'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=400&q=80',
  'red pepper flakes':
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80',
  rice: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
  'rolled oats':
    'https://images.unsplash.com/photo-1510776478953-fa4dc5de04ca?auto=format&fit=crop&w=400&q=80',
  'salmon fillet':
    'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=400&q=80',
  salt: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?auto=format&fit=crop&w=400&q=80',
  shrimp:
    'https://images.unsplash.com/photo-1559742811-822873691df8?auto=format&fit=crop&w=400&q=80',
  'sour cream':
    'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80',
  'sourdough bread':
    'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=400&q=80',
  'soy sauce':
    'https://images.unsplash.com/photo-1615203508881-9e7e357c0cc1?auto=format&fit=crop&w=400&q=80',
  spaghetti:
    'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=400&q=80',
  spinach:
    'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=400&q=80',
  strawberries:
    'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=400&q=80',
  sugar:
    'https://images.unsplash.com/photo-1673791031093-eb8eefa60083?auto=format&fit=crop&w=400&q=80',
  tofu: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?auto=format&fit=crop&w=400&q=80',
  tomato:
    'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'tomato sauce':
    'https://images.unsplash.com/photo-1572441713132-c542fc4fe282?auto=format&fit=crop&w=400&q=80',
  tomatoes:
    'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  tortillas:
    'https://images.unsplash.com/photo-1545505005-0a09f804dcf6?auto=format&fit=crop&w=400&q=80',
  'vanilla extract':
    'https://images.unsplash.com/photo-1682482198446-4cbf92f85a4b?auto=format&fit=crop&w=400&q=80',
  'vanilla ice cream':
    'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=400&q=80',
  'vegetable oil':
    'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
  zucchini:
    'https://images.unsplash.com/photo-1615485499978-1279c3d6302f?auto=format&fit=crop&w=400&q=80',
};

/** Longest keys first so "fresh basil" wins over "basil". */
const KEYS = Object.keys(INGREDIENT_IMAGE_MAP).sort((a, b) => b.length - a.length);

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unsplash photo URL for an ingredient name, with a generic fallback. */
export function ingredientImageUrl(name: string | null | undefined): string {
  const lower = normalize(name ?? '');
  if (!lower) return DEFAULT_INGREDIENT_IMAGE;

  const exact = INGREDIENT_IMAGE_MAP[lower];
  if (exact) return exact;

  for (const key of KEYS) {
    if (lower.includes(key) || key.includes(lower)) return INGREDIENT_IMAGE_MAP[key];
  }

  for (const word of lower.match(/\b\w{3,}\b/g) ?? []) {
    for (const key of KEYS) {
      if (word.includes(key) || key.includes(word)) return INGREDIENT_IMAGE_MAP[key];
    }
  }

  return DEFAULT_INGREDIENT_IMAGE;
}
