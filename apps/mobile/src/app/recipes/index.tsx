import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { CatalogRecipeCard } from '@/components/catalog-recipe-card';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Loading } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/features/i18n/locale-provider';
import { filterRecipes, RECIPE_FILTERS, type RecipeFilter } from '@/features/recipes/filter';
import { RECIPE_SORTS, sortRecipes, type RecipeSort } from '@/features/recipes/sort';
import { useRecipes } from '@/features/recipes/use-recipes';
import { useTheme } from '@/hooks/use-theme';

const FILTER_LABELS: Record<RecipeFilter, string> = {
  all: 'mobile.recipes.filterAll',
  quick: 'mobile.recipes.filterQuick',
  vegetarian: 'mobile.recipes.filterVegetarian',
  sweet: 'mobile.recipes.filterSweet',
};

const SORT_LABELS: Record<RecipeSort, string> = {
  recommended: 'mobile.recipes.sortRecommended',
  quickest: 'mobile.recipes.sortQuickest',
  name: 'mobile.recipes.sortName',
};

const SORT_ICONS: Record<RecipeSort, React.ComponentProps<typeof IconButton>['icon']> = {
  recommended: 'sparkles-outline',
  quickest: 'flash-outline',
  name: 'text-outline',
};

export default function RecipesScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const theme = useTheme();
  const router = useRouter();
  const recipes = useRecipes(locale);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecipeFilter>('all');
  const [sort, setSort] = useState<RecipeSort>('recommended');
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(
    () => sortRecipes(filterRecipes(recipes.data ?? [], query, filter), sort),
    [filter, query, recipes.data, sort],
  );

  const reset = () => {
    setQuery('');
    setFilter('all');
    setSort('recommended');
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={recipes.isRefetching}
          onRefresh={() => void recipes.refetch()}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }
    >
      <View style={styles.topBar}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel={t('mobile.recipes.back')}
          onPress={() => router.back()}
        />
      </View>

      <PageHeader
        badge={t('mobile.recipes.badge')}
        title={t('mobile.recipes.title')}
        subtitle={t('mobile.recipes.subtitle')}
        right={
          <IconButton
            icon="swap-vertical-outline"
            accessibilityLabel={t('mobile.recipes.sort')}
            onPress={() => setSortOpen(true)}
          />
        }
      />

      <TextField
        icon="search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('mobile.recipes.searchPlaceholder')}
        autoCapitalize="none"
        returnKeyType="search"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {RECIPE_FILTERS.map((option) => (
          <Chip
            key={option}
            label={t(FILTER_LABELS[option])}
            selected={filter === option}
            onPress={() => setFilter(option)}
          />
        ))}
      </ScrollView>

      {recipes.isPending ? (
        <Loading label={t('mobile.common.loading')} />
      ) : recipes.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('mobile.common.error')}
          subtitle={recipes.error.message}
          action={
            <Button variant="secondary" onPress={() => void recipes.refetch()}>
              {t('mobile.common.retry')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={t('mobile.recipes.empty')}
          subtitle={t('mobile.recipes.emptySub')}
          action={
            <Button variant="secondary" onPress={reset}>
              {t('mobile.recipes.reset')}
            </Button>
          }
        />
      ) : (
        <>
          <SectionHeader
            title={t('mobile.recipes.results')}
            subtitle={
              filtered.length === 1
                ? t('mobile.recipes.showingOne')
                : t('mobile.recipes.showing', { count: filtered.length })
            }
          />
          {filtered.map((recipe) => (
            <CatalogRecipeCard
              key={recipe.id}
              recipe={recipe}
              onPress={() =>
                router.push({ pathname: '/recipe/[id]', params: { id: String(recipe.id) } })
              }
            />
          ))}
        </>
      )}

      <ActionMenu
        visible={sortOpen}
        title={t('mobile.recipes.sortTitle')}
        cancelLabel={t('mobile.common.cancel')}
        onClose={() => setSortOpen(false)}
        items={RECIPE_SORTS.map((option) => ({
          key: option,
          label: t(SORT_LABELS[option]),
          icon: SORT_ICONS[option],
          selected: sort === option,
          onPress: () => setSort(option),
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipRow: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
});
