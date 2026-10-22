import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MatchedRecipe } from '@/features/cook/use-can-cook';

import { Card } from './ui/card';
import { ThemedText } from './themed-text';

export function MatchedRecipeCard({
  recipe,
  onPress,
}: {
  recipe: MatchedRecipe;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const complete = recipe.missingCount === 0;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={recipe.name}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => (pressed && onPress ? { opacity: 0.9 } : undefined)}>
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
            <View
              style={[
                styles.matchPill,
                { backgroundColor: complete ? theme.successSoft : theme.warningSoft },
              ]}>
              <ThemedText
                type="smallBold"
                style={{ color: complete ? theme.success : theme.warning }}>
                {Math.round(recipe.matchPercentage)}%
              </ThemedText>
            </View>
          </View>

          <View style={styles.metaRow}>
            {recipe.cookingTime ? (
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={13} color={theme.textMuted} />
                <ThemedText type="small" themeColor="textMuted">
                  {t('mobile.cook.minutes', { count: recipe.cookingTime })}
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.meta}>
              <Ionicons name="leaf-outline" size={13} color={theme.textMuted} />
              <ThemedText type="small" themeColor="textMuted">
                {t('mobile.cook.uses', { count: recipe.matchedIngredients.length })}
              </ThemedText>
            </View>
          </View>

          {recipe.missingCount > 0 ? (
            <View style={[styles.missingBox, { backgroundColor: theme.warningSoft }]}>
              <Ionicons name="basket-outline" size={15} color={theme.warning} />
              <View style={styles.missingCopy}>
                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                  {recipe.missingCount === 1
                    ? t('mobile.cook.missingOne')
                    : t('mobile.cook.missing', { count: recipe.missingCount })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {recipe.missingIngredients.join(', ')}
                </ThemedText>
              </View>
            </View>
          ) : (
            <View style={[styles.missingBox, { backgroundColor: theme.successSoft }]}>
              <Ionicons name="checkmark-circle" size={15} color={theme.success} />
              <ThemedText type="smallBold" style={{ color: theme.success }}>
                {t('mobile.cook.fullTitle')}
              </ThemedText>
            </View>
          )}

          {onPress ? (
            <View style={styles.viewRow}>
              <ThemedText type="small" themeColor="brandDark">
                {t('mobile.recipes.view')}
              </ThemedText>
              <Ionicons name="arrow-forward" size={13} color={theme.brandDark} />
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 148,
    backgroundColor: '#e7e5e4',
  },
  body: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 16,
  },
  matchPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
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
  missingBox: {
    marginTop: Spacing.one,
    borderRadius: Radius.md,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  missingCopy: {
    flex: 1,
    gap: 1,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
});
