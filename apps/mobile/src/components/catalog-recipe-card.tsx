import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { RecipeSummary } from '@/features/recipes/use-recipes';
import { useTheme } from '@/hooks/use-theme';

export interface CatalogRecipeCardProps {
  recipe: RecipeSummary;
  onPress: () => void;
}

export function CatalogRecipeCard({ recipe, onPress }: CatalogRecipeCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ingredientCount = recipe.ingredients.length;
  const extra = ingredientCount - 4;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recipe.name}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      <Card padded={false}>
        <Image
          source={{ uri: recipe.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <ThemedText type="smallBold" style={styles.title} numberOfLines={2}>
              {recipe.name}
            </ThemedText>
            <Ionicons name="chevron-forward" size={18} color={theme.brandDark} />
          </View>

          {recipe.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {recipe.description}
            </ThemedText>
          ) : null}

          <View style={styles.metaRow}>
            {recipe.cookingTime ? (
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={13} color={theme.textMuted} />
                <ThemedText type="small" themeColor="textMuted">
                  {t('mobile.recipe.minutes', { count: recipe.cookingTime })}
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.meta}>
              <Ionicons name="list-outline" size={13} color={theme.textMuted} />
              <ThemedText type="small" themeColor="textMuted">
                {ingredientCount === 1
                  ? t('mobile.recipes.ingredientsCountOne')
                  : t('mobile.recipes.ingredientsCount', { count: ingredientCount })}
              </ThemedText>
            </View>
          </View>

          {recipe.ingredients.length > 0 ? (
            <View style={styles.tagRow}>
              {recipe.ingredients.slice(0, 4).map((ingredient) => (
                <View
                  key={ingredient.id}
                  style={[styles.tag, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {ingredient.name}
                  </ThemedText>
                </View>
              ))}
              {extra > 0 ? (
                <View style={[styles.tag, { backgroundColor: theme.brandSoft }]}>
                  <ThemedText type="small" themeColor="brandDark">
                    +{extra}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.9,
  },
  image: {
    width: '100%',
    height: 164,
    backgroundColor: '#e7e5e4',
  },
  body: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tag: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
