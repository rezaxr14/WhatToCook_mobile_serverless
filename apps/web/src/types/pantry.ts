import { Ingredient } from './ingredient';
import { User } from './auth';

export interface UserPantry {
  /** The owning Supabase user id (UUID), or "guest" when signed out. */
  id: string;
  user: User;
  ingredients: Ingredient[];
  total_ingredients: number;
}
