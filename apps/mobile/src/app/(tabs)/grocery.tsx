import { ingredientCategoryKey } from '@whattocook/shared';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
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
import {
  useAddGroceryItem,
  useClearCheckedGrocery,
  useDeleteGroceryItem,
  useGrocery,
  useToggleGroceryItem,
} from '@/features/grocery/use-grocery';
import { useLocale } from '@/features/i18n/locale-provider';
import { useIngredientSearch } from '@/features/pantry/use-pantry';
import { useTheme } from '@/hooks/use-theme';

const POPULAR_ITEMS = [
  { name: 'Eggs', category: 'Dairy & Eggs' },
  { name: 'Milk', category: 'Dairy & Eggs' },
  { name: 'Bread', category: 'Grains & Pasta' },
  { name: 'Butter', category: 'Dairy & Eggs' },
  { name: 'Tomato', category: 'Produce' },
  { name: 'Rice', category: 'Grains & Pasta' },
  { name: 'Pasta', category: 'Grains & Pasta' },
  { name: 'Banana', category: 'Produce' },
];
const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'pack'];

export default function GroceryScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user } = useAuth();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const grocery = useGrocery(user?.id);
  const add = useAddGroceryItem(user?.id);
  const toggle = useToggleGroceryItem();
  const remove = useDeleteGroceryItem();
  const clearChecked = useClearCheckedGrocery(user?.id);
  const search = useIngredientSearch(showSuggestions ? name : '', locale);

  const items = grocery.data ?? [];
  const checkedCount = items.filter((item) => item.checked).length;
  const suggestions = showSuggestions ? (search.data ?? []).slice(0, 6) : [];

  const resetForm = () => {
    setName('');
    setCategory('Other');
    setAmount('1');
    setUnit('pcs');
    setShowSuggestions(false);
    setAddError(null);
  };

  const pickItem = (itemName: string, itemCategory: string) => {
    setName(itemName);
    setCategory(itemCategory);
    setShowSuggestions(false);
    setAddError(null);
  };

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (items.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
      setAddError(t('mobile.grocery.duplicate', { name: trimmed }));
      return;
    }

    const quantity = `${Math.max(1, Number(amount) || 1)} ${unit}`;
    add.mutate(
      { name: trimmed, quantity, category },
      {
        onSuccess: resetForm,
        onError: (error) => setAddError(error.message),
      },
    );
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={grocery.isRefetching}
          onRefresh={() => void grocery.refetch()}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }
    >
      <PageHeader
        badge={t('mobile.grocery.badge')}
        title={t('mobile.grocery.title')}
        subtitle={t('mobile.grocery.subtitle', { count: items.length })}
        right={
          checkedCount > 0 ? (
            <IconButton
              icon="checkmark-done-outline"
              accessibilityLabel={t('mobile.grocery.clearChecked')}
              onPress={() => clearChecked.mutate()}
            />
          ) : undefined
        }
      />

      <Card style={styles.addBlock}>
        <TextField
          value={name}
          onChangeText={(value) => {
            setName(value);
            setCategory('Other');
            setShowSuggestions(true);
            setAddError(null);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder={t('mobile.grocery.addPlaceholder')}
          icon="search"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          right={
            search.isFetching ? (
              <Ionicons name="hourglass-outline" size={16} color={theme.textMuted} />
            ) : null
          }
        />

        {/* Live catalog suggestions while typing */}
        {suggestions.length > 0 ? (
          <Card padded={false}>
            {suggestions.map((option, index) => (
              <Pressable
                key={option.id}
                onPress={() => pickItem(option.name, option.category)}
                style={({ pressed }) => [
                  styles.suggestion,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <View style={styles.suggestionCopy}>
                  <ThemedText type="smallBold">{option.name}</ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {t(ingredientCategoryKey(option.category))}
                  </ThemedText>
                </View>
                <Ionicons name="add-circle" size={22} color={theme.brand} />
              </Pressable>
            ))}
          </Card>
        ) : name.trim().length >= 2 && showSuggestions && !search.isFetching ? (
          <ThemedText type="small" themeColor="textMuted">
            {t('mobile.pantry.noResults')}
          </ThemedText>
        ) : null}

        {/* Amount + unit */}
        <View style={styles.amountRow}>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease"
              onPress={() => setAmount(String(Math.max(1, (Number(amount) || 1) - 1)))}
              hitSlop={6}
              style={({ pressed }) => [
                styles.stepButton,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="remove" size={18} color={theme.text} />
            </Pressable>
            <TextField
              containerStyle={styles.amountField}
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              textAlign="center"
              accessibilityLabel={t('mobile.grocery.amount')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase"
              onPress={() => setAmount(String((Number(amount) || 1) + 1))}
              hitSlop={6}
              style={({ pressed }) => [
                styles.stepButton,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="add" size={18} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.unitRow}>
            {UNITS.map((option) => {
              const selected = option === unit;
              return (
                <Pressable
                  key={option}
                  onPress={() => setUnit(option)}
                  style={({ pressed }) => [
                    styles.unitChip,
                    {
                      backgroundColor: selected ? theme.brand : theme.backgroundElement,
                      borderColor: selected ? theme.brand : theme.border,
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={selected ? styles.unitChipTextSelected : undefined}
                  >
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {addError ? (
          <ThemedText type="small" themeColor="danger">
            {addError}
          </ThemedText>
        ) : null}

        <Button onPress={handleAdd} icon="add" disabled={!name.trim()} loading={add.isPending}>
          {t('mobile.grocery.add')}
        </Button>

        {/* Popular staples — one tap fills both the item and its category. */}
        <View style={styles.popularBlock}>
          <ThemedText type="small" themeColor="textMuted">
            {t('mobile.grocery.popular')}
          </ThemedText>
          <View style={styles.popularRow}>
            {POPULAR_ITEMS.map((item) => (
              <Pressable
                key={item.name}
                onPress={() => pickItem(item.name, item.category)}
                style={({ pressed }) => [
                  styles.popularChip,
                  { borderColor: theme.border },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText type="small">{item.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </Card>

      {grocery.isPending ? (
        <Loading label={t('mobile.common.loading')} />
      ) : grocery.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('mobile.common.error')}
          subtitle={grocery.error.message}
          action={
            <Button variant="secondary" onPress={() => void grocery.refetch()}>
              {t('mobile.common.retry')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title={t('mobile.grocery.empty')}
          subtitle={t('mobile.grocery.emptySub')}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Card key={item.id} style={styles.item}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked }}
                onPress={() => toggle.mutate({ id: item.id, checked: !item.checked })}
                hitSlop={8}
              >
                <Ionicons
                  name={item.checked ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={item.checked ? theme.success : theme.borderStrong}
                />
              </Pressable>
              <View style={styles.itemCopy}>
                <ThemedText
                  type="smallBold"
                  numberOfLines={2}
                  style={
                    item.checked
                      ? { textDecorationLine: 'line-through', color: theme.textMuted }
                      : undefined
                  }
                >
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  {item.category === 'Other' ? t('mobile.grocery.category') : item.category}
                  {item.quantity ? ` · ${item.quantity}` : ''}
                </ThemedText>
              </View>
              <IconButton
                icon="trash-outline"
                size={17}
                tone="danger"
                accessibilityLabel={`${t('mobile.common.delete')} ${item.name}`}
                onPress={() => remove.mutate(item.id)}
              />
            </Card>
          ))}

          {checkedCount > 0 ? (
            <Button variant="ghost" onPress={() => clearChecked.mutate()}>
              {t('mobile.grocery.clearChecked')} ({checkedCount})
            </Button>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBlock: {
    gap: Spacing.two,
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
  amountRow: {
    gap: Spacing.two,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e7e5e4',
  },
  amountField: {
    width: 92,
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  unitChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
  },
  unitChipTextSelected: {
    color: '#ffffff',
  },
  popularBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  popularRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  popularChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
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
  itemCopy: {
    flex: 1,
    gap: 1,
  },
});
