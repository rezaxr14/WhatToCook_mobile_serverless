import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { CookingTimer } from '@/components/cooking-timer';
import { DishImage } from '@/components/dish-image';
import { RecipeChatCard } from '@/components/recipe-chat';
import { SubstitutePanel } from '@/components/substitute-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Loading } from '@/components/ui/loading';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useAddGroceryItems } from '@/features/grocery/use-grocery';
import { useLocale } from '@/features/i18n/locale-provider';
import { usePantry } from '@/features/pantry/use-pantry';
import { scaleQuantity } from '@/features/recipes/scale';
import { useRecipe } from '@/features/recipes/use-recipes';
import { useTheme } from '@/hooks/use-theme';
import { shareRecipe } from '@/lib/share';

const SERVING_OPTIONS = [1, 2, 4, 6, 8] as const;

function parseId(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export default function RecipeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = parseId(params.id);

  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const recipe = useRecipe(id, locale);
  const pantry = usePantry(user?.id, locale);
  const addGrocery = useAddGroceryItems(user?.id);

  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({});
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);
  const [swapId, setSwapId] = useState<number | null>(null);

  if (!id) {
    return (
      <Screen>
        <View style={styles.topBar}>
          <IconButton
            icon="arrow-back"
            accessibilityLabel={t('mobile.recipe.back')}
            onPress={() => router.back()}
          />
        </View>
        <EmptyState
          icon="restaurant-outline"
          title={t('mobile.recipe.notFound')}
          subtitle={t('mobile.recipe.notFoundSub')}
          action={
            <Button variant="secondary" onPress={() => router.replace('/recipes')}>
              {t('mobile.recipes.title')}
            </Button>
          }
        />
      </Screen>
    );
  }

  if (recipe.isPending) {
    return (
      <Screen>
        <View style={styles.topBar}>
          <IconButton
            icon="arrow-back"
            accessibilityLabel={t('mobile.recipe.back')}
            onPress={() => router.back()}
          />
        </View>
        <Loading label={t('mobile.common.loading')} />
      </Screen>
    );
  }

  if (recipe.isError || !recipe.data) {
    return (
      <Screen>
        <View style={styles.topBar}>
          <IconButton
            icon="arrow-back"
            accessibilityLabel={t('mobile.recipe.back')}
            onPress={() => router.back()}
          />
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('mobile.recipe.errorTitle')}
          subtitle={recipe.error?.message ?? t('mobile.common.error')}
          action={
            <Button variant="secondary" onPress={() => void recipe.refetch()}>
              {t('mobile.common.retry')}
            </Button>
          }
        />
      </Screen>
    );
  }

  const data = recipe.data;
  const servings = servingsOverride ?? data.baseServings;
  const multiplier = servings / data.baseServings;
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));
  const missing = data.recipeIngredients.filter((item) => !pantryIds.has(item.ingredientId));
  const swapIngredient = data.recipeIngredients.find((item) => item.recipeIngredientId === swapId);
  const prepped = Object.values(checked).filter(Boolean).length;

  const addMissingToGrocery = () => {
    if (missing.length === 0) {
      Alert.alert(t('mobile.recipe.addToGrocery'), t('mobile.recipe.allStocked'));
      return;
    }
    addGrocery.mutate(
      missing.map((item) => ({
        name: item.name,
        quantity:
          [scaleQuantity(item.quantity, multiplier), item.unit]
            .filter((part) => part && part.trim())
            .join(' ') || '1',
      })),
      {
        onSuccess: () =>
          Alert.alert(t('mobile.recipe.addToGrocery'), t('mobile.recipe.addedToGrocery')),
        onError: (error) => Alert.alert(t('mobile.common.error'), error.message),
      },
    );
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={recipe.isRefetching}
          onRefresh={() => void recipe.refetch()}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }
    >
      <View style={styles.topBar}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel={t('mobile.recipe.back')}
          onPress={() => router.back()}
        />
        <View style={styles.topActions}>
          <View style={[styles.catalogPill, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="book-outline" size={12} color={theme.textMuted} />
            <ThemedText type="small" themeColor="textMuted">
              {t('mobile.recipes.badge')}
            </ThemedText>
          </View>
          <IconButton
            icon="share-social-outline"
            accessibilityLabel={t('mobile.recipe.share')}
            onPress={() =>
              void shareRecipe({
                name: data.name,
                description: data.description,
                url: `whattocook://recipe/${data.id}`,
              })
            }
          />
        </View>
      </View>

      <Card padded={false}>
        <DishImage uri={data.imageUrl} name={data.name} style={styles.hero} />
        <View style={styles.heroBody}>
          <View style={styles.badgeRow}>
            {data.cookingTime ? (
              <Badge
                icon="time-outline"
                text={t('mobile.recipe.minutes', { count: data.cookingTime })}
              />
            ) : null}
            <Badge
              icon="people-outline"
              text={
                servings === 1
                  ? t('mobile.recipe.servingsValueOne')
                  : t('mobile.recipe.servingsValue', { count: servings })
              }
            />
            <Badge
              icon="list-outline"
              text={
                data.recipeIngredients.length === 1
                  ? t('mobile.recipes.ingredientsCountOne')
                  : t('mobile.recipes.ingredientsCount', {
                      count: data.recipeIngredients.length,
                    })
              }
            />
          </View>
          <ThemedText type="subtitle" style={styles.title}>
            {data.name}
          </ThemedText>
          {data.description ? (
            <ThemedText themeColor="textSecondary">{data.description}</ThemedText>
          ) : null}
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionHeader
          title={t('mobile.recipe.ingredients')}
          subtitle={t('mobile.recipe.prepped', {
            done: prepped,
            total: data.recipeIngredients.length,
          })}
        />

        <View style={styles.servingsRow}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('mobile.recipe.portions')}
          </ThemedText>
          <View style={styles.servingsChips}>
            {SERVING_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={String(option)}
                selected={servings === option}
                onPress={() => setServingsOverride(option)}
              />
            ))}
          </View>
        </View>

        {data.recipeIngredients.map((item) => {
          const isChecked = Boolean(checked[item.recipeIngredientId]);
          const stocked = pantryIds.has(item.ingredientId);
          return (
            <View key={item.recipeIngredientId} style={styles.ingredientRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                onPress={() =>
                  setChecked((current) => ({
                    ...current,
                    [item.recipeIngredientId]: !isChecked,
                  }))
                }
                hitSlop={6}
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: isChecked ? theme.success : 'transparent',
                    borderColor: isChecked ? theme.success : theme.borderStrong,
                  },
                ]}
              >
                {isChecked ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
              </Pressable>

              <View style={styles.ingredientCopy}>
                <View style={styles.ingredientNameRow}>
                  <ThemedText type="smallBold" style={isChecked ? styles.checkedText : undefined}>
                    {item.name}
                  </ThemedText>
                  {item.optional ? (
                    <ThemedText type="small" themeColor="textMuted">
                      {t('mobile.recipe.optional')}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText type="small" themeColor="textMuted">
                  {[scaleQuantity(item.quantity, multiplier), item.unit]
                    .filter((part) => part && part.trim())
                    .join(' ')}
                </ThemedText>
              </View>

              {stocked ? (
                <View style={[styles.stockTag, { backgroundColor: theme.successSoft }]}>
                  <ThemedText type="small" themeColor="success">
                    {t('mobile.recipe.inPantry')}
                  </ThemedText>
                </View>
              ) : (
                <Pressable
                  onPress={() =>
                    setSwapId((current) =>
                      current === item.recipeIngredientId ? null : item.recipeIngredientId,
                    )
                  }
                  hitSlop={6}
                  accessibilityRole="button"
                >
                  <ThemedText type="small" themeColor="brandDark">
                    {t('mobile.recipe.swap')}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          );
        })}

        {swapIngredient ? (
          <SubstitutePanel
            key={swapIngredient.recipeIngredientId}
            ingredientName={swapIngredient.name}
            recipeName={data.name}
            availableIngredients={(pantry.data ?? []).map((item) => item.name)}
          />
        ) : null}

        <Button
          variant="secondary"
          icon="cart-outline"
          loading={addGrocery.isPending}
          onPress={addMissingToGrocery}
        >
          {t('mobile.recipe.addMissing')}
        </Button>
      </Card>

      <Card style={styles.section}>
        <SectionHeader
          title={t('mobile.recipe.instructions')}
          subtitle={
            data.instructions.length === 1
              ? t('mobile.recipe.stepsOne')
              : t('mobile.recipe.steps', { count: data.instructions.length })
          }
        />
        {data.instructions.map((step, index) => {
          const done = Boolean(doneSteps[index]);
          return (
            <Pressable
              key={`${index}-${step.slice(0, 20)}`}
              onPress={() => setDoneSteps((current) => ({ ...current, [index]: !done }))}
              style={({ pressed }) => [styles.stepRow, pressed && { opacity: 0.8 }]}
            >
              <View
                style={[
                  styles.stepNumber,
                  { backgroundColor: done ? theme.success : theme.brandSoft },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#ffffff" />
                ) : (
                  <ThemedText type="smallBold" themeColor="brandDark">
                    {index + 1}
                  </ThemedText>
                )}
              </View>
              <ThemedText
                type="small"
                style={[styles.stepText, done ? styles.checkedText : undefined]}
              >
                {step}
              </ThemedText>
            </Pressable>
          );
        })}
      </Card>

      <CookingTimer initialMinutes={data.cookingTime ?? 15} />

      <RecipeChatCard
        recipeName={data.name}
        ingredients={data.recipeIngredients.map((item) => item.name)}
        instructions={data.instructions}
      />
    </Screen>
  );
}

function Badge({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
      <Ionicons name={icon} size={12} color={theme.textMuted} />
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  catalogPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  hero: {
    width: '100%',
    height: 230,
    backgroundColor: '#e7e5e4',
  },
  heroBody: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  section: {
    gap: Spacing.three,
  },
  servingsRow: {
    gap: Spacing.two,
  },
  servingsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientCopy: {
    flex: 1,
    gap: 1,
  },
  ingredientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkedText: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
  stockTag: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
});
