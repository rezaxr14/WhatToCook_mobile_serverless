import React from 'react';
import { motion } from 'framer-motion';
import { Utensils, Sparkles } from 'lucide-react';
import { Recipe, MatchedRecipe } from '../../types/recipe';
import { RecipeCard } from './RecipeCard';
import { StyledButton } from '../common/StyledButton';

interface RecipeGridProps {
  recipes: (Recipe | MatchedRecipe)[];
  isLoading?: boolean;
  isMatched?: boolean;
  onResetFilters?: () => void;
}

export const RecipeGrid: React.FC<RecipeGridProps> = ({
  recipes,
  isLoading,
  isMatched,
  onResetFilters,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div
            key={n}
            className="rounded-3xl border border-stone-200 bg-white p-4 h-96 flex flex-col justify-between animate-pulse"
          >
            <div className="w-full h-48 bg-stone-200 rounded-2xl mb-4" />
            <div className="space-y-2.5">
              <div className="w-2/3 h-5 bg-stone-200 rounded-lg" />
              <div className="w-full h-3 bg-stone-100 rounded-lg" />
              <div className="w-4/5 h-3 bg-stone-100 rounded-lg" />
            </div>
            <div className="w-full h-10 bg-stone-200 rounded-xl mt-4" />
          </div>
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="p-12 text-center bg-white/70 backdrop-blur-md rounded-3xl border border-stone-200 max-w-lg mx-auto my-8">
        <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4">
          <Utensils className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-900 mb-2">No matching dishes found</h3>
        <p className="text-stone-500 text-sm mb-6 leading-relaxed">
          Try loosening your filter criteria or search query to explore more recipes.
        </p>
        {onResetFilters && (
          <StyledButton $variant="secondary" onClick={onResetFilters}>
            Reset Filters
          </StyledButton>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {recipes.map((recipe, index) => (
        <motion.div
          key={recipe.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(index * 0.06, 0.4) }}
        >
          <RecipeCard recipe={recipe} isMatched={isMatched} />
        </motion.div>
      ))}
    </div>
  );
};
