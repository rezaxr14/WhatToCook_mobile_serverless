import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useSubstitutesQuery } from '@/features/ai/use-ai';
import { useTheme } from '@/hooks/use-theme';

export interface SubstitutePanelProps {
  ingredientName: string;
  recipeName?: string;
  availableIngredients?: string[];
}

/** Inline AI substitute list for a missing recipe ingredient. */
export function SubstitutePanel({
  ingredientName,
  recipeName,
  availableIngredients,
}: SubstitutePanelProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const substitutes = useSubstitutesQuery({
    missingIngredient: ingredientName,
    recipeName,
    availableIngredients,
  });

  useEffect(() => {
    if (substitutes.data?.remaining) {
      queryClient.setQueryData(['ai-usage'], substitutes.data.remaining);
    }
  }, [queryClient, substitutes.data]);

  return (
    <View
      style={[
        styles.box,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}>
      <SectionHeader title={t('mobile.recipe.swapTitle', { name: ingredientName })} />
      {substitutes.isPending ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('mobile.recipe.swapLoading')}
        </ThemedText>
      ) : substitutes.isError ? (
        <ThemedText type="small" themeColor="danger">
          {substitutes.error.message}
        </ThemedText>
      ) : substitutes.data ? (
        <>
          {substitutes.data.substitutes.map((substitute) => (
            <View key={substitute.name} style={styles.row}>
              <ThemedText type="smallBold">{substitute.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {substitute.ratio} — {substitute.notes}
              </ThemedText>
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {substitutes.data.tip}
          </ThemedText>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('mobile.recipe.swapEmpty')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    gap: 2,
  },
});
