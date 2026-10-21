-- Canonical catalog seed ported from the reference SQLite snapshot.
-- This is a migration (not only seed.sql) so staging receives the same catalog via db push.

-- Plans and runtime configuration
insert into public.plans (id, name, features, monthly_budget_micro_usd, max_image_bytes, is_active)
values
  ('anonymous', 'Anonymous', '{"suggestions":10,"recipe":10,"chat":10,"stream":5,"scan":3}'::jsonb, 500000, 5242880, true),
  ('free', 'Free', '{"suggestions":30,"recipe":30,"chat":50,"stream":20,"scan":10}'::jsonb, 2000000, 5242880, true),
  ('pro', 'Pro', '{"suggestions":200,"recipe":200,"chat":300,"stream":100,"scan":50}'::jsonb, 10000000, 10485760, true)
on conflict (id) do update set
  name = excluded.name,
  features = excluded.features,
  monthly_budget_micro_usd = excluded.monthly_budget_micro_usd,
  max_image_bytes = excluded.max_image_bytes,
  is_active = excluded.is_active;

insert into public.app_config (id, ai_kill_switch, global_daily_cap_micro_usd, feature_flags, model_routing)
values (1, false, 5000000, '{"suggestions":true,"recipe":true,"chat":true,"stream":true,"scan":true}'::jsonb, '{}'::jsonb)
on conflict (id) do update set
  feature_flags = excluded.feature_flags,
  model_routing = excluded.model_routing;

-- Prices are in micro-USD per 1M tokens. Inactive until verified against current provider pricing.
insert into public.ai_model_prices (provider, model, input_micro_usd_per_million, output_micro_usd_per_million, active, effective_from, source_note)
values
  ('openai', 'gpt-4.1-mini', 400000, 1600000, false, '2026-01-01T00:00:00Z', 'verify against provider pricing before enabling'),
  ('openai', 'gpt-4.1', 2000000, 8000000, false, '2026-01-01T00:00:00Z', 'verify against provider pricing before enabling'),
  ('anthropic', 'claude-sonnet-4-20250514', 3000000, 15000000, false, '2026-01-01T00:00:00Z', 'verify against provider pricing before enabling'),
  ('google', 'gemini-2.5-flash', 300000, 2500000, false, '2026-01-01T00:00:00Z', 'verify against provider pricing before enabling')
on conflict (provider, model, effective_from) do nothing;

-- Ingredients (IDs and calories preserved from the reference snapshot)
insert into public.ingredients (id, slug, names, category, calories_per_100g) values
  (1, 'garlic', '{"en":"Garlic"}'::jsonb, 'Produce', 149.0),
  (2, 'onion', '{"en":"Onion"}'::jsonb, 'Produce', 40.0),
  (3, 'tomato', '{"en":"Tomato"}'::jsonb, 'Produce', 18.0),
  (4, 'potato', '{"en":"Potato"}'::jsonb, 'Produce', 77.0),
  (5, 'avocado', '{"en":"Avocado"}'::jsonb, 'Produce', 160.0),
  (6, 'spinach', '{"en":"Spinach"}'::jsonb, 'Produce', 23.0),
  (7, 'broccoli', '{"en":"Broccoli"}'::jsonb, 'Produce', 34.0),
  (8, 'mushrooms', '{"en":"Mushrooms"}'::jsonb, 'Produce', 22.0),
  (9, 'bell-pepper', '{"en":"Bell Pepper"}'::jsonb, 'Produce', 31.0),
  (10, 'carrot', '{"en":"Carrot"}'::jsonb, 'Produce', 41.0),
  (11, 'cucumber', '{"en":"Cucumber"}'::jsonb, 'Produce', 15.0),
  (12, 'lemon', '{"en":"Lemon"}'::jsonb, 'Produce', 29.0),
  (13, 'lime', '{"en":"Lime"}'::jsonb, 'Produce', 30.0),
  (14, 'fresh-basil', '{"en":"Fresh Basil"}'::jsonb, 'Produce', 23.0),
  (15, 'ginger', '{"en":"Ginger"}'::jsonb, 'Produce', 80.0),
  (16, 'chili-pepper', '{"en":"Chili Pepper"}'::jsonb, 'Produce', 40.0),
  (17, 'zucchini', '{"en":"Zucchini"}'::jsonb, 'Produce', 17.0),
  (18, 'cilantro', '{"en":"Cilantro"}'::jsonb, 'Produce', 23.0),
  (19, 'green-onion', '{"en":"Green Onion"}'::jsonb, 'Produce', 32.0),
  (20, 'lettuce', '{"en":"Lettuce"}'::jsonb, 'Produce', 15.0),
  (21, 'celery', '{"en":"Celery"}'::jsonb, 'Produce', 16.0),
  (22, 'banana', '{"en":"Banana"}'::jsonb, 'Produce', 89.0),
  (23, 'strawberries', '{"en":"Strawberries"}'::jsonb, 'Produce', 32.0),
  (24, 'blueberries', '{"en":"Blueberries"}'::jsonb, 'Produce', 57.0),
  (25, 'apple', '{"en":"Apple"}'::jsonb, 'Produce', 52.0),
  (26, 'eggs', '{"en":"Eggs"}'::jsonb, 'Dairy & Eggs', 155.0),
  (27, 'milk', '{"en":"Milk"}'::jsonb, 'Dairy & Eggs', 42.0),
  (28, 'butter', '{"en":"Butter"}'::jsonb, 'Dairy & Eggs', 717.0),
  (29, 'cheddar-cheese', '{"en":"Cheddar Cheese"}'::jsonb, 'Dairy & Eggs', 402.0),
  (30, 'parmesan', '{"en":"Parmesan"}'::jsonb, 'Dairy & Eggs', 431.0),
  (31, 'mozzarella', '{"en":"Mozzarella"}'::jsonb, 'Dairy & Eggs', 280.0),
  (32, 'feta-cheese', '{"en":"Feta Cheese"}'::jsonb, 'Dairy & Eggs', 264.0),
  (33, 'heavy-cream', '{"en":"Heavy Cream"}'::jsonb, 'Dairy & Eggs', 340.0),
  (34, 'greek-yogurt', '{"en":"Greek Yogurt"}'::jsonb, 'Dairy & Eggs', 59.0),
  (35, 'sour-cream', '{"en":"Sour Cream"}'::jsonb, 'Dairy & Eggs', 193.0),
  (36, 'vanilla-ice-cream', '{"en":"Vanilla Ice Cream"}'::jsonb, 'Dairy & Eggs', 207.0),
  (37, 'chocolate-ice-cream', '{"en":"Chocolate Ice Cream"}'::jsonb, 'Dairy & Eggs', 216.0),
  (38, 'cream-cheese', '{"en":"Cream Cheese"}'::jsonb, 'Dairy & Eggs', 342.0),
  (39, 'chicken-breast', '{"en":"Chicken Breast"}'::jsonb, 'Meat & Seafood', 165.0),
  (40, 'chicken-thighs', '{"en":"Chicken Thighs"}'::jsonb, 'Meat & Seafood', 209.0),
  (41, 'ground-beef', '{"en":"Ground Beef"}'::jsonb, 'Meat & Seafood', 250.0),
  (42, 'beef-steak', '{"en":"Beef Steak"}'::jsonb, 'Meat & Seafood', 271.0),
  (43, 'bacon', '{"en":"Bacon"}'::jsonb, 'Meat & Seafood', 541.0),
  (44, 'salmon-fillet', '{"en":"Salmon Fillet"}'::jsonb, 'Meat & Seafood', 208.0),
  (45, 'shrimp', '{"en":"Shrimp"}'::jsonb, 'Meat & Seafood', 99.0),
  (46, 'canned-tuna', '{"en":"Canned Tuna"}'::jsonb, 'Meat & Seafood', 116.0),
  (47, 'pork-chop', '{"en":"Pork Chop"}'::jsonb, 'Meat & Seafood', 231.0),
  (48, 'tofu', '{"en":"Tofu"}'::jsonb, 'Meat & Seafood', 76.0),
  (49, 'ham', '{"en":"Ham"}'::jsonb, 'Meat & Seafood', 145.0),
  (50, 'bread', '{"en":"Bread"}'::jsonb, 'Grains & Pasta', 265.0),
  (51, 'sourdough-bread', '{"en":"Sourdough Bread"}'::jsonb, 'Grains & Pasta', 240.0),
  (52, 'pasta', '{"en":"Pasta"}'::jsonb, 'Grains & Pasta', 131.0),
  (53, 'spaghetti', '{"en":"Spaghetti"}'::jsonb, 'Grains & Pasta', 158.0),
  (54, 'rice', '{"en":"Rice"}'::jsonb, 'Grains & Pasta', 130.0),
  (55, 'jasmine-rice', '{"en":"Jasmine Rice"}'::jsonb, 'Grains & Pasta', 130.0),
  (56, 'flour', '{"en":"Flour"}'::jsonb, 'Grains & Pasta', 364.0),
  (57, 'rolled-oats', '{"en":"Rolled Oats"}'::jsonb, 'Grains & Pasta', 389.0),
  (58, 'tortillas', '{"en":"Tortillas"}'::jsonb, 'Grains & Pasta', 237.0),
  (59, 'burger-buns', '{"en":"Burger Buns"}'::jsonb, 'Grains & Pasta', 270.0),
  (60, 'noodles', '{"en":"Noodles"}'::jsonb, 'Grains & Pasta', 138.0),
  (61, 'quinoa', '{"en":"Quinoa"}'::jsonb, 'Grains & Pasta', 120.0),
  (62, 'olive-oil', '{"en":"Olive Oil"}'::jsonb, 'Pantry & Spices', 884.0),
  (63, 'vegetable-oil', '{"en":"Vegetable Oil"}'::jsonb, 'Pantry & Spices', 884.0),
  (64, 'tomato-sauce', '{"en":"Tomato Sauce"}'::jsonb, 'Pantry & Spices', 29.0),
  (65, 'soy-sauce', '{"en":"Soy Sauce"}'::jsonb, 'Pantry & Spices', 53.0),
  (66, 'honey', '{"en":"Honey"}'::jsonb, 'Pantry & Spices', 304.0),
  (67, 'sugar', '{"en":"Sugar"}'::jsonb, 'Pantry & Spices', 387.0),
  (68, 'salt', '{"en":"Salt"}'::jsonb, 'Pantry & Spices', 0.0),
  (69, 'black-pepper', '{"en":"Black Pepper"}'::jsonb, 'Pantry & Spices', 251.0),
  (70, 'red-pepper-flakes', '{"en":"Red Pepper Flakes"}'::jsonb, 'Pantry & Spices', 318.0),
  (71, 'oregano', '{"en":"Oregano"}'::jsonb, 'Pantry & Spices', 265.0),
  (72, 'cinnamon', '{"en":"Cinnamon"}'::jsonb, 'Pantry & Spices', 247.0),
  (73, 'vanilla-extract', '{"en":"Vanilla Extract"}'::jsonb, 'Pantry & Spices', 288.0),
  (74, 'maple-syrup', '{"en":"Maple Syrup"}'::jsonb, 'Pantry & Spices', 260.0),
  (75, 'mustard', '{"en":"Mustard"}'::jsonb, 'Pantry & Spices', 66.0),
  (76, 'mayonnaise', '{"en":"Mayonnaise"}'::jsonb, 'Pantry & Spices', 680.0),
  (77, 'ketchup', '{"en":"Ketchup"}'::jsonb, 'Pantry & Spices', 112.0),
  (78, 'peanut-butter', '{"en":"Peanut Butter"}'::jsonb, 'Pantry & Spices', 588.0),
  (79, 'cocoa-powder', '{"en":"Cocoa Powder"}'::jsonb, 'Pantry & Spices', 228.0),
  (80, 'baking-powder', '{"en":"Baking Powder"}'::jsonb, 'Pantry & Spices', 53.0)
on conflict (id) do nothing;

-- Recipes (IDs preserved; instructions stored as an ordered JSON array)
insert into public.recipes (id, catalog_key, source, title, description, instructions, cooking_time_minutes, image_path) values
  (1, 'artisan-garlic-butter-grilled-cheese', 'catalog', '{"en":"Artisan Garlic Butter Grilled Cheese"}'::jsonb, '{"en":"Crispy golden sourdough crust infused with crushed garlic herb butter and molten sharp cheddar core."}'::jsonb, '["1. Spread garlic butter generously on outer sourdough slices.","2. Layer thick sharp cheddar slices inside.","3. Toast in a heavy skillet over medium-low heat until deep amber crisp and cheese stretches beautifully.","4. Slice diagonally and serve steaming hot."]'::jsonb, 15, 'recipes/grilled_cheese.jpg'),
  (2, 'golden-french-cheesy-omelette', 'catalog', '{"en":"Golden French Cheesy Omelette"}'::jsonb, '{"en":"Velvety French-style folded eggs loaded with melted aged cheddar, fragrant butter, and cracked pepper."}'::jsonb, '["1. Whisk eggs with sea salt and cracked black pepper until smooth.","2. Melt butter in a non-stick skillet on medium heat until foaming.","3. Pour eggs, swirl gently in circular motions to form silky soft curds.","4. Sprinkle cheddar down center, fold carefully, and slide onto a warm plate."]'::jsonb, 10, 'recipes/omelette.jpg'),
  (3, 'tuscan-garlic-herb-chicken-skillet', 'catalog', '{"en":"Tuscan Garlic Herb Chicken Skillet"}'::jsonb, '{"en":"Pan-seared tender chicken breast simmered in rich garlic olive oil, rosemary, cracked pepper, and parmesan glaze."}'::jsonb, '["1. Season chicken breasts with sea salt, black pepper, and dried Italian herbs.","2. Heat olive oil and butter in a cast-iron skillet over medium-high.","3. Sear chicken for 6-7 minutes per side until deeply golden.","4. Add minced garlic cloves in final 2 minutes for an aromatic pan sauce. Rest 5 minutes before slicing."]'::jsonb, 25, 'recipes/chicken_skillet.jpg'),
  (4, 'classic-italian-creamy-carbonara', 'catalog', '{"en":"Classic Italian Creamy Carbonara"}'::jsonb, '{"en":"Al dente pasta tossed in a luxurious emulsion of egg yolks, crisp cured bacon, parmesan, and cracked pepper."}'::jsonb, '["1. Boil pasta in salted water until al dente; reserve 1/2 cup pasta cooking water.","2. Whisk egg yolks with finely grated parmesan and cracked black pepper in a bowl.","3. Cook bacon until crisp in a skillet.","4. Toss hot pasta directly into skillet, remove from heat, and rapidly stir in egg-cheese mixture with a splash of pasta water until glossy and velvety."]'::jsonb, 20, 'recipes/carbonara.jpg'),
  (5, 'rustic-pomodoro-penne-pasta', 'catalog', '{"en":"Rustic Pomodoro Penne Pasta"}'::jsonb, '{"en":"Rich slow-simmered tomato sauce with sweet basil, sautéed garlic, extra virgin olive oil, and aged parmesan."}'::jsonb, '["1. Sauté crushed garlic in shimmering olive oil until fragrant.","2. Pour in crushed tomato sauce, season with salt and pepper, and simmer for 12 minutes.","3. Cook pasta al dente and fold directly into simmering sauce.","4. Finish with freshly grated parmesan and fresh basil leaves."]'::jsonb, 18, 'recipes/penne_pomodoro.jpg'),
  (6, 'mediterranean-sauteed-garlic-shrimp', 'catalog', '{"en":"Mediterranean Sautéed Garlic Shrimp"}'::jsonb, '{"en":"Plump succulent shrimp sizzled in extra virgin olive oil, chili flakes, minced garlic, lemon, and butter."}'::jsonb, '["1. Heat olive oil and butter in a large skillet over medium-high heat.","2. Add garlic and red chili flakes, sizzling for 30 seconds until aromatic.","3. Add shrimp in a single layer; cook 2 minutes per side until pink and opaque.","4. Season with sea salt and squeeze fresh lemon juice. Serve with crusty bread."]'::jsonb, 12, 'recipes/garlic_shrimp.jpg'),
  (7, 'avocado-and-poached-egg-sourdough-toast', 'catalog', '{"en":"Avocado & Poached Egg Sourdough Toast"}'::jsonb, '{"en":"Creamy whipped avocado on toasted sourdough topped with a delicate runny poached egg, chili flakes, and sea salt."}'::jsonb, '["1. Toast sourdough slices until golden and sturdy.","2. Mash ripe avocado with a pinch of sea salt and lemon juice.","3. Poach fresh eggs in gently simmering water for 3 minutes.","4. Spread mashed avocado generously over toast, crown with poached egg, and dust with black pepper."]'::jsonb, 10, 'recipes/avocado_toast.jpg'),
  (8, 'savory-garlic-fried-rice-with-egg', 'catalog', '{"en":"Savory Garlic Fried Rice with Egg"}'::jsonb, '{"en":"Fragrant wok-tossed jasmine rice infused with golden toasted garlic chips, scrambled egg ribbons, and soy butter."}'::jsonb, '["1. Sizzle thinly sliced garlic in olive oil and butter until crispy golden chips; reserve half for garnish.","2. Push garlic to side, scramble eggs into soft curds.","3. Add cold cooked rice, toss over high heat with soy sauce, black pepper and a drizzle of butter.","4. Top with crispy garlic chips and serve immediately."]'::jsonb, 15, 'recipes/garlic_fried_rice.jpg'),
  (9, 'gourmet-shakshuka-with-feta-and-crusty-bread', 'catalog', '{"en":"Gourmet Shakshuka with Feta & Crusty Bread"}'::jsonb, '{"en":"Poached eggs nestled in a spiced Mediterranean tomato pepper stew topped with creamy crumbled cheese and warm bread."}'::jsonb, '["1. Heat olive oil in a skillet, sauté garlic, onions and bell peppers until soft.","2. Pour in rich tomato sauce, season with salt and pepper, and simmer until thick.","3. Make small wells in the sauce and crack eggs directly in.","4. Cover and cook gently for 6 minutes until egg whites set but yolks remain runny. Crumble feta on top and serve with warm crusty bread."]'::jsonb, 22, 'recipes/shakshuka.jpg'),
  (10, 'fluffy-buttermilk-breakfast-pancakes', 'catalog', '{"en":"Fluffy Buttermilk Breakfast Pancakes"}'::jsonb, '{"en":"Golden light-as-air pancakes served with melting butter and pure maple syrup drizzle."}'::jsonb, '["1. Whisk eggs, milk, and melted butter in a bowl.","2. Gently fold flour and sugar until combined without overmixing.","3. Ladle batter onto a hot buttered griddle over medium heat.","4. Flip when bubbles form on top (2-3 min) and cook until golden brown. Drizzle with maple syrup."]'::jsonb, 15, 'recipes/pancakes.jpg'),
  (11, 'classic-affogato-al-caffe', 'catalog', '{"en":"Classic Affogato al Caffe"}'::jsonb, '{"en":"Silky scoop of rich vanilla ice cream drowned in a hot shot of dark espresso with shaved dark chocolate."}'::jsonb, '["1. Place a large scoop of artisanal vanilla ice cream into a chilled glass or ceramic cup.","2. Brew a piping hot fresh double espresso shot.","3. Pour hot espresso immediately over the cold ice cream.","4. Garnish with a sprinkle of cocoa powder and enjoy immediately."]'::jsonb, 5, 'recipes/affogato.jpg'),
  (12, 'warm-banana-rum-crepes-a-la-mode', 'catalog', '{"en":"Warm Banana Rum Crepes a la Mode"}'::jsonb, '{"en":"Delicate golden crepes folded over caramelized sweet bananas crowned with melting vanilla ice cream and honey."}'::jsonb, '["1. Whisk flour, milk, eggs, and a pinch of salt into a silky thin batter.","2. Cook crepes in a buttered non-stick pan for 1-2 minutes per side until golden.","3. Sauté sliced bananas in butter and honey until golden and caramelized.","4. Fold crepes with warm bananas and top with a scoop of vanilla ice cream."]'::jsonb, 15, 'recipes/banana_crepes.jpg')
on conflict (id) do nothing;

-- Recipe ingredient join rows (65 rows)
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit, sort_order) values
  (1, 1, 50, '2', 'slices', 0),
  (2, 1, 29, '75', 'g', 1),
  (3, 1, 28, '2', 'tbsp', 2),
  (4, 1, 1, '2', 'cloves', 3),
  (5, 2, 26, '3', 'pcs', 0),
  (6, 2, 29, '50', 'g', 1),
  (7, 2, 28, '1', 'tbsp', 2),
  (8, 2, 69, '1', 'pinch', 3),
  (9, 3, 39, '400', 'g', 0),
  (10, 3, 1, '4', 'cloves', 1),
  (11, 3, 62, '2', 'tbsp', 2),
  (12, 3, 28, '1', 'tbsp', 3),
  (13, 3, 30, '30', 'g', 4),
  (14, 4, 52, '250', 'g', 0),
  (15, 4, 26, '3', 'pcs', 1),
  (16, 4, 43, '100', 'g', 2),
  (17, 4, 30, '60', 'g', 3),
  (18, 4, 69, '1', 'tsp', 4),
  (19, 4, 62, '1', 'tbsp', 5),
  (20, 5, 52, '300', 'g', 0),
  (21, 5, 64, '250', 'ml', 1),
  (22, 5, 1, '3', 'cloves', 2),
  (23, 5, 62, '2', 'tbsp', 3),
  (24, 5, 30, '40', 'g', 4),
  (25, 6, 45, '350', 'g', 0),
  (26, 6, 1, '5', 'cloves', 1),
  (27, 6, 62, '3', 'tbsp', 2),
  (28, 6, 28, '1', 'tbsp', 3),
  (29, 6, 68, '1', 'tsp', 4),
  (30, 6, 50, '2', 'slices', 5),
  (31, 7, 50, '2', 'slices', 0),
  (32, 7, 5, '1', 'whole', 1),
  (33, 7, 26, '2', 'pcs', 2),
  (34, 7, 62, '1', 'tsp', 3),
  (35, 7, 68, '1', 'pinch', 4),
  (36, 7, 69, '1', 'pinch', 5),
  (37, 8, 54, '300', 'g', 0),
  (38, 8, 26, '2', 'pcs', 1),
  (39, 8, 1, '4', 'cloves', 2),
  (40, 8, 28, '1.5', 'tbsp', 3),
  (41, 8, 62, '1', 'tbsp', 4),
  (42, 8, 65, '1', 'tbsp', 5),
  (43, 8, 69, '1', 'tsp', 6),
  (44, 9, 26, '3', 'pcs', 0),
  (45, 9, 64, '300', 'ml', 1),
  (46, 9, 9, '1', 'whole', 2),
  (47, 9, 1, '3', 'cloves', 3),
  (48, 9, 62, '2', 'tbsp', 4),
  (49, 9, 32, '50', 'g', 5),
  (50, 9, 50, '3', 'slices', 6),
  (51, 10, 56, '200', 'g', 0),
  (52, 10, 27, '250', 'ml', 1),
  (53, 10, 26, '2', 'pcs', 2),
  (54, 10, 28, '3', 'tbsp', 3),
  (55, 10, 67, '2', 'tbsp', 4),
  (56, 10, 74, '3', 'tbsp', 5),
  (57, 11, 36, '2', 'scoops', 0),
  (58, 11, 79, '1', 'tsp', 1),
  (59, 12, 56, '120', 'g', 0),
  (60, 12, 27, '200', 'ml', 1),
  (61, 12, 26, '2', 'pcs', 2),
  (62, 12, 22, '2', 'whole', 3),
  (63, 12, 28, '2', 'tbsp', 4),
  (64, 12, 66, '2', 'tbsp', 5),
  (65, 12, 36, '2', 'scoops', 6)
on conflict (id) do nothing;

-- Keep identity sequences ahead of the explicit reference IDs.
select setval(pg_get_serial_sequence('public.ingredients', 'id'), coalesce((select max(id) from public.ingredients), 1), true);
select setval(pg_get_serial_sequence('public.recipes', 'id'), coalesce((select max(id) from public.recipes), 1), true);
select setval(pg_get_serial_sequence('public.recipe_ingredients', 'id'), coalesce((select max(id) from public.recipe_ingredients), 1), true);

-- Storage buckets. Images themselves are uploaded separately (local objects_path or CLI).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('recipe-images', 'recipe-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('scan-uploads', 'scan-uploads', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
