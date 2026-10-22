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
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import {
  useAddGroceryItem,
  useClearCheckedGrocery,
  useDeleteGroceryItem,
  useGrocery,
  useToggleGroceryItem,
} from '@/features/grocery/use-grocery';
import { useTheme } from '@/hooks/use-theme';

export default function GroceryScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');

  const grocery = useGrocery(user?.id);
  const add = useAddGroceryItem(user?.id);
  const toggle = useToggleGroceryItem();
  const remove = useDeleteGroceryItem();
  const clearChecked = useClearCheckedGrocery(user?.id);

  const items = grocery.data ?? [];
  const checkedCount = items.filter((item) => item.checked).length;

  const handleAdd = () => {
    if (!name.trim()) return;
    add.mutate(
      { name, quantity },
      {
        onSuccess: () => {
          setName('');
          setQuantity('');
        },
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
      }>
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

      <View style={styles.addBlock}>
        <View style={styles.addRow}>
          <TextField
            containerStyle={styles.nameField}
            value={name}
            onChangeText={setName}
            placeholder={t('mobile.grocery.addPlaceholder')}
            icon="cart-outline"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <TextField
            containerStyle={styles.qtyField}
            value={quantity}
            onChangeText={setQuantity}
            placeholder={t('mobile.grocery.quantityPlaceholder')}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
        </View>
        <Button
          onPress={handleAdd}
          icon="add"
          disabled={!name.trim()}
          loading={add.isPending}>
          {t('mobile.grocery.add')}
        </Button>
      </View>

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
                hitSlop={8}>
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
                  }>
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
  addRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  nameField: {
    flex: 1,
  },
  qtyField: {
    width: 78,
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
