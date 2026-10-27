import { describe, expect, it } from 'vitest';

import {
  assignDishPhotoFiles,
  DISH_PHOTO_FILES,
  matchDishPhoto,
  pickDishPhoto,
} from './dish-photos';

describe('matchDishPhoto', () => {
  it('prefers a specific dish over a generic word', () => {
    expect(matchDishPhoto({ name: 'Spaghetti Carbonara' })).toBe('recipes/carbonara.jpg');
    expect(matchDishPhoto({ name: 'Creamy Shrimp Alfredo' })).toBe('dishes/shrimp_alfredo.webp');
    expect(matchDishPhoto({ name: 'Lemon Garlic Pasta' })).toBe('recipes/spaghetti.jpg');
  });

  it('uses the provider hint before a playful dish name', () => {
    expect(matchDishPhoto({ name: 'Sunset Skillet Surprise', image_hint: 'soup' })).toBe(
      'dishes/lentil_soup.webp',
    );
  });

  it('falls back to the cuisine when the name has no keyword', () => {
    expect(matchDishPhoto({ name: 'Chef Special', cuisine: 'Persian' })).toBe(
      'dishes/lentil_soup.webp',
    );
    expect(matchDishPhoto({ name: 'Chef Special', cuisine: 'Italian' })).toBe(
      'recipes/penne_pomodoro.jpg',
    );
  });

  it('does not confuse eggplant with egg', () => {
    expect(matchDishPhoto({ name: 'Roasted Eggplant Salad' })).not.toBe('recipes/omelette.jpg');
  });

  it('returns null for an unknown dish with no cuisine', () => {
    expect(matchDishPhoto({ name: 'Zorp Surprise' })).toBeNull();
  });
});

describe('pickDishPhoto', () => {
  it('is stable and always returns a pool photo', () => {
    const first = pickDishPhoto('Zorp Surprise');
    expect(first).toBe(pickDishPhoto('Zorp Surprise'));
    expect(DISH_PHOTO_FILES).toContain(first);
  });
});

describe('assignDishPhotoFiles', () => {
  it('never repeats a photo for different dishes', () => {
    const files = assignDishPhotoFiles([
      { name: 'Pasta One' },
      { name: 'Pasta Two' },
      { name: 'Pasta Three' },
      { name: 'Zorp Surprise' },
    ]);
    expect(new Set(files).size).toBe(files.length);
  });

  it('keeps the natural photo when it is unique', () => {
    expect(assignDishPhotoFiles([{ name: 'Beef Stew' }, { name: 'Caesar Salad' }])).toEqual([
      'dishes/beef.webp',
      'dishes/caesar.webp',
    ]);
  });
});
