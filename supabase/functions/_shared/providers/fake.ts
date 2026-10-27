import type { AIProvider, ProviderRequest, ProviderResult } from '../types.ts';
import { providerError } from '../errors.ts';

export interface FakeProviderOptions {
  delayMs?: number;
  failFeatures?: Array<string>;
  invalidOutput?: boolean;
  emptyOutput?: boolean;
  rateLimitedModels?: string[];
  failTimes?: Partial<Record<string, number>>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function recipeNameFromPrompt(prompt: string): string {
  const match = prompt.match(/for '([^']+)'/i);
  return match?.[1]?.trim() || "Chef's Fake Creation";
}

function outputFor(request: ProviderRequest): string {
  const feature = request.metadata?.feature ?? 'recipe';
  const name = recipeNameFromPrompt(request.prompt);
  switch (feature) {
    case 'suggestions':
      return JSON.stringify([
        {
          name: 'Lemon Garlic Pasta',
          short_description: 'Silky pasta tossed with lemon, garlic and a little olive oil.',
          cuisine: 'Italian',
          difficulty: 'Easy',
          prep_time: '20 mins',
          image_hint: 'pasta',
        },
        {
          name: 'Tomato Egg Skillet',
          short_description: 'A quick skillet built from pantry staples.',
          cuisine: 'Mediterranean',
          difficulty: 'Easy',
          prep_time: '15 mins',
          image_hint: 'eggs',
        },
        {
          name: 'Herb Chicken Rice',
          short_description: 'Comforting rice with chicken and herbs.',
          cuisine: 'Global',
          difficulty: 'Medium',
          prep_time: '35 mins',
          image_hint: 'chicken',
        },
        {
          name: 'Cheese Toast',
          short_description: 'Crisp toast with melted cheese and garlic.',
          cuisine: 'French',
          difficulty: 'Easy',
          prep_time: '10 mins',
          image_hint: 'toast',
        },
        {
          name: 'Pantry Soup',
          short_description: 'A flexible soup using whatever is on hand.',
          cuisine: 'Home',
          difficulty: 'Easy',
          prep_time: '30 mins',
          image_hint: 'soup',
        },
      ]);
    case 'recipe':
      return JSON.stringify({
        name,
        description:
          'A cozy, pantry-friendly dish finished with good olive oil and a handful of fresh herbs.',
        cuisine: 'Mediterranean',
        difficulty: 'Easy',
        time_minutes: 25,
        servings: 4,
        ingredients: [
          { name: 'Spaghetti', amount: '300', unit: 'g' },
          { name: 'Olive oil', amount: '2', unit: 'tbsp' },
          { name: 'Garlic', amount: '2', unit: 'cloves' },
        ],
        instructions: [
          {
            step: 'Bring a pot of salted water to a boil and prepare the ingredients.',
            time_minutes: 5,
            chef_tip: 'Mise en place keeps the cooking calm.',
          },
          {
            step: 'Cook until tender, season to taste and serve warm.',
            time_minutes: 15,
            chef_tip: 'Taste before serving.',
          },
        ],
        nutrition: { calories: '380 kcal', protein: '18g', carbs: '42g', fat: '12g' },
        chef_tips: ['Reserve a splash of cooking water to loosen the sauce.'],
      });
    case 'stream':
      return (
        `# ${name}\n\n` +
        '**Preparation Time:** 25 mins | **Difficulty:** Easy | **Servings:** 4\n\n' +
        '## Ingredients\n- 300g spaghetti\n- 2 tbsp olive oil\n- 2 cloves garlic\n\n' +
        '## Instructions\n1. Prepare the ingredients and heat a pan over medium heat.\n2. Cook until tender and season to taste.\n\n' +
        '## Nutrition\nCalories: 380 kcal | Protein: 18g | Carbs: 42g | Fat: 12g\n'
      );
    case 'chat':
      return 'Use a similar ingredient with the same texture. Taste as you go and adjust the seasoning at the end.';
    case 'scan':
      return JSON.stringify([
        {
          name: 'Eggs',
          category: 'Dairy & Eggs',
          confidence: 0.98,
          estimated_quantity: '6 eggs',
        },
        {
          name: 'Tomato',
          category: 'Produce',
          confidence: 0.93,
          estimated_quantity: '3 pieces',
        },
        {
          name: 'Milk',
          category: 'Dairy & Eggs',
          confidence: 0.88,
          estimated_quantity: '1 bottle',
        },
        {
          name: 'Garlic',
          category: 'Produce',
          confidence: 0.8,
          estimated_quantity: '2 bulbs',
        },
        {
          name: 'Dragon Fruit',
          category: 'Produce',
          confidence: 0.3,
          estimated_quantity: null,
        },
      ]);
    case 'substitution':
      return JSON.stringify({
        missing_ingredient: 'Butter',
        substitutes: [
          { name: 'Olive oil', ratio: '3/4 cup oil for 1 cup butter', notes: 'Best for sauteing.' },
          { name: 'Greek yogurt', ratio: '1/2 cup for 1 cup butter', notes: 'Best for baking.' },
        ],
        tip: 'Add the substitute gradually and taste before serving.',
        disclaimer: 'Check labels for allergens.',
      });
    default:
      return 'Fake provider response.';
  }
}

export class FakeProvider implements AIProvider {
  readonly id = 'fake';
  readonly calls: Array<{ method: string; feature: string; model: string }> = [];
  private readonly counts = new Map<string, number>();

  constructor(private readonly options: FakeProviderOptions = {}) {}

  private async run(
    method: string,
    request: ProviderRequest,
    output = outputFor(request),
  ): Promise<ProviderResult> {
    const started = performance.now();
    const feature = request.metadata?.feature ?? 'recipe';
    this.calls.push({ method, feature, model: request.model });
    this.counts.set(feature, (this.counts.get(feature) ?? 0) + 1);

    const failTimes = this.options.failTimes?.[feature] ?? 0;
    if (
      this.options.failFeatures?.includes(feature) ||
      (failTimes > 0 && (this.counts.get(feature) ?? 0) <= failTimes)
    ) {
      throw providerError('fake provider failure');
    }
    await sleep(this.options.delayMs ?? 0, request.signal);
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let text = output;
    if (this.options.invalidOutput) text = '{"not": "the requested schema"'; // invalid JSON
    if (this.options.emptyOutput) text = '';

    return {
      text,
      usage: {
        input_tokens: Math.max(1, Math.ceil(request.prompt.length / 4) + 12),
        output_tokens: Math.max(1, Math.ceil(text.length / 4)),
      },
      model: request.model || 'fake-1',
      provider: this.id,
      latency_ms: Math.round(performance.now() - started),
      rate_limited_models: this.options.rateLimitedModels ?? [],
    };
  }

  generateText(request: ProviderRequest): Promise<ProviderResult> {
    return this.run('generateText', request);
  }

  generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    return this.run('generateStructured', request);
  }

  async *streamText(request: ProviderRequest): AsyncGenerator<string, ProviderResult, void> {
    const result = await this.run('streamText', request);
    const chunks = result.text.match(/.{1,32}/gs) ?? [result.text];
    for (const chunk of chunks) {
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await sleep(this.options.delayMs ?? 0, request.signal);
      yield chunk;
    }
    return result;
  }

  visionExtract(request: ProviderRequest): Promise<ProviderResult> {
    return this.run('visionExtract', request);
  }
}
