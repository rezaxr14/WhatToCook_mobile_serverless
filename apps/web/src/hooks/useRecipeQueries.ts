import { useQuery } from '@tanstack/react-query';
import { recipeApi } from '../api/recipeApi';
import { CAN_COOK_QUERY_KEY } from './usePantryQueries';

export const RECIPES_QUERY_KEY = ['recipes'] as const;

export const useRecipesQuery = () => {
  return useQuery({
    queryKey: RECIPES_QUERY_KEY,
    queryFn: () => recipeApi.getAllRecipes(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useCanCookQuery = () => {
  return useQuery({
    queryKey: CAN_COOK_QUERY_KEY,
    queryFn: () => recipeApi.getCanCookRecipes(),
    staleTime: 1000 * 30, // 30 seconds
  });
};
