import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Loading } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useLocale } from '@/features/i18n/locale-provider';
import {
  useAddPantryIngredients,
  useClearPantry,
  useIngredientSearch,
  usePantry,
  useRemovePantryIngredient,
} from '@/features/pantry/use-pantry';
import { useTheme } from '@/hooks/use-theme';

export default function PantryScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user } = useAuth();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const pantry = usePantry(user?.id, locale);
  const search = useIngredientSearch(query, locale);
  const add = useAddPantryIngredients(user?.id);
  const remove = useRemovePantryIngredient(user?.id);
  const clear = useClearPantry(user?.id);

  const items = pantry.data ?? [];
  const suggestions = query.trim().length >= 2 ? (search.data ?? []) : [];

  const handleAdd = (ingredientId: number) => {
    add.mutate([ingredientId], {
      onSuccess: () => setQuery(''),
    });
  };

  const handleClear = () => {
    Alert.alert(t('mobile.pantry.clearAll'), t('mobile.pantry.clearConfirm'), [
      { text: t('mobile.common.cancel'), style: 'cancel' },
      {
        text: t('mobile.pantry.clearAll'),
        style: 'destructive',
        onPress: () => clear.mutate(),
      },
    ]);
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={pantry.isRefetching}
          onRefresh={() => void pantry.refetch()}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }>
      <PageHeader
        badge={t('mobile.pantry.badge')}
        title={t('mobile.pantry.title')}
        subtitle={t('mobile.pantry.subtitle', { count: items.length })}
        right={
          items.length > 0 ? (
            <IconButton
              icon="trash-outline"
              tone="danger"
              accessibilityLabel={t('mobile.pantry.clearAll')}
              onPress={handleClear}
            />
          ) : undefined
        }
      />

      <View style={styles.searchBlock}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.pantry.addPlaceholder')}
          icon="search"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          right={
            search.isFetching ? <ActivityIndicator size="small" color={theme.brand} /> : null
          }
        />

        {suggestions.length > 0 ? (
          <Card padded={false}>
            {suggestions.map((option, index) => (
              <Pressable
                key={option.id}
                onPress={() => handleAdd(option.id)}
                style={({ pressed }) => [
                  styles.suggestion,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}>
                <View style={styles.suggestionCopy}>
                  <ThemedText type="smallBold">{option.name}</ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {option.category}
                  </ThemedText>
                </View>
                <Ionicons name="add-circle" size={22} color={theme.brand} />
              </Pressable>
            ))}
          </Card>
        ) : query.trim().length >= 2 && !search.isFetching ? (
          <ThemedText type="small" themeColor="textMuted">
            {t('mobile.pantry.noResults')}
          </ThemedText>
        ) : null}
      </View>

      {pantry.isPending ? (
        <Loading label={t('mobile.common.loading')} />
      ) : pantry.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('mobile.common.error')}
          subtitle={pantry.error.message}
          action={
            <Pressable onPress={() => void pantry.refetch()}>
              <ThemedText type="smallBold" themeColor="brandDark">
                {t('mobile.common.retry')}
              </ThemedText>
            </Pressable>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="basket-outline"
          title={t('mobile.pantry.empty')}
          subtitle={t('mobile.pantry.emptySub')}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Card key={item.ingredientId} style={styles.item}>
              <View style={[styles.itemIcon, { backgroundColor: theme.brandSoft }]}>
                <Ionicons name="leaf" size={18} color={theme.brandDark} />
              </View>
              <View style={styles.itemCopy}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                  {item.calories
                    ? t('mobile.pantry.calories', { count: item.calories })
                    : item.category}
                </ThemedText>
              </View>
              <IconButton
                icon="close"
                size={16}
                accessibilityLabel={`${t('mobile.pantry.remove')} ${item.name}`}
                onPress={() => remove.mutate(item.ingredientId)}
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBlock: {
    gap: Spacing.two,
    zIndex: 2,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  suggestionCopy: {
    flex: 1,
    gap: 1,
  },
  list: {
    gap: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCopy: {
    flex: 1,
    gap: 1,
  },
});
