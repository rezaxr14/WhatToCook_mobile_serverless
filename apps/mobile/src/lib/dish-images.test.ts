import { describe, expect, it } from 'vitest';

import { assignUniqueDishPhotos, getDishImageUrl } from './dish-images';

describe('getDishImageUrl', () => {
  it('keeps a real server-provided image', () => {
    expect(getDishImageUrl('Anything', 'https://cdn.example.com/dish.jpg')).toBe(
      'https://cdn.example.com/dish.jpg',
    );
  });

  it('maps dish keywords to a matching photo', () => {
    const pasta = getDishImageUrl('Lemon Garlic Pasta');
    const pizza = getDishImageUrl('Margherita Pizza');
    expect(pasta).toContain('unsplash.com');
    expect(pizza).toContain('unsplash.com');
    expect(pasta).not.toBe(pizza);
  });

  it('is deterministic for unknown dishes', () => {
    expect(getDishImageUrl('Zorp Stew')).toBe(getDishImageUrl('Zorp Stew'));
  });
});

describe('assignUniqueDishPhotos', () => {
  it('never assigns the same photo to different dishes', () => {
    const photos = assignUniqueDishPhotos([
      { name: 'Pasta One' },
      { name: 'Pasta Two' },
      { name: 'Pasta Three' },
      { name: 'Pizza Night' },
    ]);
    expect(new Set(photos).size).toBe(photos.length);
  });

  it('prefers each dish image when it is unique', () => {
    const photos = assignUniqueDishPhotos([
      { name: 'One', image: 'https://cdn.example.com/one.jpg' },
      { name: 'Two', image: 'https://cdn.example.com/two.jpg' },
    ]);
    expect(photos).toEqual(['https://cdn.example.com/one.jpg', 'https://cdn.example.com/two.jpg']);
  });

  it('uses the provider image hint when the dish name has no keyword', () => {
    const photos = assignUniqueDishPhotos([
      { name: 'Sunset Skillet Surprise', image_hint: 'pasta' },
      { name: 'Grandma’s Sunday Special', image_hint: 'soup' },
    ]);
    expect(photos).toEqual([getDishImageUrl('pasta'), getDishImageUrl('soup')]);
  });
});
