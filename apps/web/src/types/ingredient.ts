export interface Ingredient {
  id: number;
  name: string;
  calories_per_100g: number | null;
  category: string;
  image_url?: string;
}

export interface RecipeIngredient {
  id: number;
  ingredient: Ingredient;
  quantity: string;
  unit: string;
}

export interface ScannedIngredient {
  name: string;
  display_name?: string;
  category: string;
  confidence: number;
  estimated_quantity?: string | null;
  ingredient_id?: number | null;
  slug?: string | null;
  matched?: boolean;
}

export interface ScanFridgeResponse {
  status: string;
  detected_count: number;
  matched_count?: number;
  detected_ingredients: ScannedIngredient[];
  items?: ScannedIngredient[];
  auto_added: boolean;
  added_ingredients: string[];
  pantry?: any;
}
