/**
 * Scale an ingredient quantity such as `2`, `2.5`, `1/2` or `1 1/2 cups`.
 * Non-numeric strings (a pinch, to taste) are returned unchanged.
 */
export function scaleQuantity(quantity: string, multiplier: number): string {
  if (multiplier === 1 || !quantity) return quantity;

  const fraction = quantity.match(/^(\d+)\/(\d+)(.*)$/);
  if (fraction) {
    const value = (Number(fraction[1]) / Number(fraction[2])) * multiplier;
    return `${format(value)}${fraction[3]}`;
  }

  const number = quantity.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (number) {
    const value = Number(number[1]);
    if (Number.isFinite(value)) return `${format(value * multiplier)}${number[2]}`;
  }

  return quantity;
}

function format(value: number): string {
  if (value % 1 === 0) return String(value);
  return String(Number(value.toFixed(2)));
}
