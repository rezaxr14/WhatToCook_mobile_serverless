import type { z } from 'zod';
import { invalidModelOutput } from './errors.ts';
import { repairPrompt } from './prompts.ts';
import type { AIProvider, ProviderRequest, ProviderResult } from './types.ts';

export interface ValidatedResult<T> {
  data: T;
  providerResult: ProviderResult;
  attempts: number;
}

export async function generateValidated<T>(input: {
  provider: AIProvider;
  request: ProviderRequest;
  schema: z.ZodType<T>;
  normalize?: (value: unknown) => unknown;
  maxAttempts?: number;
  mode?: 'structured' | 'vision';
}): Promise<ValidatedResult<T>> {
  const maxAttempts = input.maxAttempts ?? 2;
  let lastError = 'unknown validation error';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const request: ProviderRequest =
      attempt === 1
        ? input.request
        : {
            ...input.request,
            prompt: `${input.request.prompt}\n\n${repairPrompt(lastError)}`,
          };
    const providerResult =
      input.mode === 'vision'
        ? await input.provider.visionExtract(request)
        : await input.provider.generateStructured(request);
    try {
      const parsed = parseJsonText(providerResult.text);
      const normalized = input.normalize ? input.normalize(parsed) : parsed;
      const sanitized = sanitizeJsonStrings(normalized);
      const validated = input.schema.safeParse(sanitized);
      if (!validated.success) {
        lastError = summarizeZodError(validated.error);
        continue;
      }
      return { data: validated.data, providerResult, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw invalidModelOutput(`The AI response did not match the expected schema (${lastError}).`);
}

export function parseJsonText(text: string): unknown {
  const cleaned = stripCodeFences(text).trim();
  if (!cleaned) throw invalidModelOutput('The AI returned an empty response.');

  try {
    return JSON.parse(cleaned);
  } catch {
    const candidate = findBalancedJson(cleaned);
    if (!candidate) throw invalidModelOutput('The AI response was not valid JSON.');
    try {
      return JSON.parse(candidate);
    } catch {
      throw invalidModelOutput('The AI response was not valid JSON.');
    }
  }
}

export function stripCodeFences(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  return fenced?.[1]?.trim() ?? trimmed;
}

function findBalancedJson(text: string): string | null {
  const start = Math.min(...[text.indexOf('{'), text.indexOf('[')].filter((index) => index >= 0));
  if (!Number.isFinite(start) || start < 0) return null;
  const opening = text[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function normalizeSuggestions(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.recipes)) return record.recipes;
    if (Array.isArray(record.dishes)) return record.dishes;
    if (Array.isArray(record.suggestions)) return record.suggestions;
    // Some free routers return a single dish object instead of an array.
    if (typeof record.name === 'string' && typeof record.short_description === 'string') {
      return [record];
    }
  }
  return value;
}

export function normalizeRecipeDetail(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.recipe && typeof record.recipe === 'object' && !Array.isArray(record.recipe)) {
      return record.recipe;
    }
  }
  return value;
}

export function normalizeScan(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.ingredients)) return record.ingredients;
    if (Array.isArray(record.detected_ingredients)) return record.detected_ingredients;
    if (Array.isArray(record.items)) return record.items;
  }
  return value;
}

export function normalizeSubstitution(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (
      record.substitution &&
      typeof record.substitution === 'object' &&
      !Array.isArray(record.substitution)
    ) {
      return record.substitution;
    }
  }
  return value;
}

export function sanitizeJsonStrings(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonStrings);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[sanitizeText(key)] = sanitizeJsonStrings(entry);
    }
    return output;
  }
  return value;
}

export function sanitizeText(value: string): string {
  // Strip NUL/control characters except tab and newline. React/Vue escape
  // markup by default, so we do not treat model output as HTML.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function summarizeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ');
}
