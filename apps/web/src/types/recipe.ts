import { Ingredient, RecipeIngredient } from './ingredient';

export interface Recipe {
  id: number;
  name: string;
  description: string;
  cooking_time: number | null;
  instructions: string;
  image: string | null;
  image_url?: string;
  ingredients: Ingredient[];
  recipe_ingredients?: RecipeIngredient[];
}

export interface MatchedRecipe extends Recipe {
  match_percentage: number;
  missing_count: number;
  missing_ingredients: string[];
  matched_ingredients: string[];
}

export interface CanCookResponse {
  full_matches: MatchedRecipe[];
  partial_matches: MatchedRecipe[];
  pantry_ingredient_count: number;
  total_full_matches: number;
  total_partial_matches: number;
}
