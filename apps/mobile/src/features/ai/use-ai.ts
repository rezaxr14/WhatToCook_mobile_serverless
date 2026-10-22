import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import i18n from '@/i18n';

import {
  fetchAiCatalog,
  fetchRecipeDetail,
  fetchSubstitutes,
  fetchUsage,
  generateSuggestions,
  scanPantryImage,
  sendRecipeChat,
  type SuggestionsInput,
} from './api';

const USAGE_KEY = ['ai-usage'] as const;

export function useAiCatalog() {
  return useQuery({
    queryKey: ['ai-catalog'],
    queryFn: fetchAiCatalog,
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

export function useAiUsage(enabled = true) {
  return useQuery({
    queryKey: USAGE_KEY,
    queryFn: fetchUsage,
    enabled,
    staleTime: 60_000,
    retry: 0,
  });
}

export function useGenerateSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SuggestionsInput) => generateSuggestions(input),
    onSuccess: (data) => {
      if (data.remaining) queryClient.setQueryData(USAGE_KEY, data.remaining);
    },
  });
}

export function useAiRecipeDetail(recipeName: string, model?: string, servings = 4) {
  return useQuery({
    queryKey: ['ai-recipe', recipeName, model ?? 'default', servings, i18n.resolvedLanguage],
    queryFn: () => fetchRecipeDetail(recipeName, model, servings),
    enabled: Boolean(recipeName),
    staleTime: 60 * 60_000,
    retry: 0,
  });
}

export function useRecipeChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof sendRecipeChat>[0]) => sendRecipeChat(input),
    onSuccess: (data) => {
      if (data.remaining) queryClient.setQueryData(USAGE_KEY, data.remaining);
    },
  });
}

export function useScanPantry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof scanPantryImage>[0]) => scanPantryImage(input),
    onSuccess: (data) => {
      if (data.remaining) queryClient.setQueryData(USAGE_KEY, data.remaining);
    },
  });
}

export function useSubstitutes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof fetchSubstitutes>[0]) => fetchSubstitutes(input),
    onSuccess: (data) => {
      if (data.remaining) queryClient.setQueryData(USAGE_KEY, data.remaining);
    },
  });
}
