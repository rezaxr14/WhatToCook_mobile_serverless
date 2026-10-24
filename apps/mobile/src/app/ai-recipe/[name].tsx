import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { CookingTimer } from '@/components/cooking-timer';
import { RecipeChatCard } from '@/components/recipe-chat';
import { SubstitutePanel } from '@/components/substitute-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Loading } from '@/components/ui/loading';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useAiRecipeDetail } from '@/features/ai/use-ai';
import { useAuth } from '@/features/auth/auth-provider';
import { useAddGroceryItems } from '@/features/grocery/use-grocery';
import { useLocale } from '@/features/i18n/locale-provider';
import { usePantry } from '@/features/pantry/use-pantry';
import { useTheme } from '@/hooks/use-theme';
import { shareRecipe } from '@/lib/share';
import { getDishImageUrl } from '@/lib/dish-images';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AIRecipeScreen() {
  const params = useLocalSearchParams<{
    name?: string | string[];
    model?: string | string[];
    servings?: string | string[];
  }>();
  const name = firstParam(params.name);
  const model = firstParam(params.model) || undefined;
  const requestedServings = Number(firstParam(params.servings));
  const servings =
    Number.isFinite(requestedServings) && requestedServings >= 1 && requestedServings <= 24
      ? Math.round(requestedServings)
      : 4;

  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const detail = useAiRecipeDetail(name ?? '', model, servings);
  const pantry = usePantry(user?.id, locale);
  const addGrocery = useAddGroceryItems(user?.id);

  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({});
  const [swapName, setSwapName] = useState<string | null>(null);

  const recipe = detail.data;
  const heroImage = recipe ? getDishImageUrl(recipe.name, recipe.image) : undefined;
  const remaining = recipe?.remaining?.daily.suggestions?.remaining;

  const handleGrocery = () => {
    if (!recipe) return;
    addGrocery.mutate(
      recipe.ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity:
          [ingredient.amount, ingredient.unit].filter((part) => part && part.trim()).join(' ') ||
          '1',
      })),
      {
        onSuccess: () =>
          Alert.alert(t('mobile.recipe.addToGrocery'), t('mobile.recipe.addedToGrocery')),
        onError: (error) => Alert.alert(t('mobile.common.error'), error.message),
      },
    );
  };

  const handleSwap = (ingredientName: string) => {
    setSwapName((current) => (current === ingredientName ? null : ingredientName));
  };

  if (detail.isPending) {
    return (
      <Screen>
        <View style={styles.topBar}>
          <IconButton
            icon="arrow-back"
            accessibilityLabel={t('mobile.recipe.back')}
            onPress={() => router.back()}
          />
        </View>
        <Loading label={t('mobile.ai.generating')} />
      </Screen>
    );
  }

  if (detail.isError || !recipe) {
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
          subtitle={detail.error?.message ?? t('mobile.recipe.errorSub')}
          action={
            <Button variant="secondary" onPress={() => void detail.refetch()}>
              {t('mobile.ai.retry')}
            </Button>
          }
        />
      </Screen>
    );
  }

  const nutrition = recipe.nutrition;
  const nutritionEntries = nutrition
    ? [
        { label: t('mobile.recipe.calories'), value: nutrition.calories },
        { label: t('mobile.recipe.protein'), value: nutrition.protein },
        { label: t('mobile.recipe.carbs'), value: nutrition.carbs },
        { label: t('mobile.recipe.fat'), value: nutrition.fat },
      ].filter((entry) => Boolean(entry.value))
    : [];

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={styles.topBar}>
          <IconButton
            icon="arrow-back"
            accessibilityLabel={t('mobile.recipe.back')}
            onPress={() => router.back()}
          />
          <View style={styles.topActions}>
            <View style={styles.topMeta}>
              {recipe.cached ? (
                <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="save-outline" size={12} color={theme.textMuted} />
                  <ThemedText type="small" themeColor="textMuted">
                    {t('mobile.ai.cached')}
                  </ThemedText>
                </View>
              ) : null}
              {remaining !== null && remaining !== undefined ? (
                <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="flash" size={12} color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('mobile.ai.remaining', { count: remaining })}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <IconButton
              icon="share-social-outline"
              accessibilityLabel={t('mobile.recipe.share')}
              onPress={() =>
                void shareRecipe({
                  name: recipe.name,
                  description: recipe.description,
                  url: `whattocook://ai-recipe/${encodeURIComponent(recipe.name)}?servings=${servings}`,
                })
              }
            />
          </View>
        </View>

        <Card padded={false}>
          <Image
            source={{ uri: heroImage }}
            style={styles.hero}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.heroBody}>
            <View style={styles.badgeRow}>
              <Badge icon="globe-outline" text={recipe.cuisine} />
              <Badge icon="speedometer-outline" text={recipe.difficulty} />
              <Badge
                icon="time-outline"
                text={t('mobile.recipe.minutes', { count: recipe.time_minutes })}
              />
              {recipe.servings ? (
                <Badge
                  icon="people-outline"
                  text={
                    recipe.servings === 1
                      ? t('mobile.recipe.servingsValueOne')
                      : t('mobile.recipe.servingsValue', { count: recipe.servings })
                  }
                />
              ) : null}
            </View>
            <ThemedText type="subtitle" style={styles.title}>
              {recipe.name}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{recipe.description}</ThemedText>
            {recipe.model_used ? (
              <View style={styles.modelRow}>
                <Ionicons name="hardware-chip-outline" size={13} color={theme.textMuted} />
                <ThemedText type="small" themeColor="textMuted">
                  {recipe.model_used}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </Card>

        {nutritionEntries.length > 0 ? (
          <Card style={styles.section}>
            <SectionHeader title={t('mobile.recipe.nutrition')} />
            <View style={styles.nutritionRow}>
              {nutritionEntries.map((entry) => (
                <View key={entry.label} style={styles.nutritionItem}>
                  <ThemedText type="smallBold" themeColor="brandDark" style={styles.nutritionValue}>
                    {entry.value}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {entry.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card style={styles.section}>
          <SectionHeader
            title={t('mobile.recipe.ingredients')}
            subtitle={
              (recipe.servings ?? 4) === 1
                ? t('mobile.recipe.servingsValueOne')
                : t('mobile.recipe.servingsValue', { count: recipe.servings ?? 4 })
            }
          />
          {recipe.ingredients.map((ingredient, index) => {
            const key = `${ingredient.name}-${index}`;
            const checked = Boolean(checkedIngredients[key]);
            return (
              <View key={key} style={styles.ingredientRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() =>
                    setCheckedIngredients((current) => ({ ...current, [key]: !checked }))
                  }
                  hitSlop={6}
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: checked ? theme.success : 'transparent',
                      borderColor: checked ? theme.success : theme.borderStrong,
                    },
                  ]}
                >
                  {checked ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                </Pressable>
                <View style={styles.ingredientCopy}>
                  <ThemedText type="smallBold" style={checked ? styles.checkedText : undefined}>
                    {ingredient.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {[ingredient.amount, ingredient.unit].filter(Boolean).join(' ')}
                  </ThemedText>
                </View>
                <Pressable onPress={() => handleSwap(ingredient.name)} hitSlop={6}>
                  <ThemedText type="small" themeColor="brandDark">
                    {t('mobile.recipe.swap')}
                  </ThemedText>
                </Pressable>
              </View>
            );
          })}

          {swapName ? (
            <SubstitutePanel
              key={swapName}
              ingredientName={swapName}
              recipeName={recipe.name}
              availableIngredients={(pantry.data ?? []).map((item) => item.name)}
            />
          ) : null}

          <Button
            variant="secondary"
            icon="cart-outline"
            loading={addGrocery.isPending}
            onPress={handleGrocery}
          >
            {t('mobile.recipe.addToGrocery')}
          </Button>
        </Card>

        <Card style={styles.section}>
          <SectionHeader title={t('mobile.recipe.instructions')} />
          {recipe.instructions.map((instruction, index) => {
            const done = Boolean(doneSteps[index]);
            return (
              <Pressable
                key={`${index}-${instruction.step.slice(0, 20)}`}
                onPress={() => setDoneSteps((current) => ({ ...current, [index]: !done }))}
                style={({ pressed }) => [styles.stepRow, pressed && { opacity: 0.8 }]}
              >
                <View
                  style={[
                    styles.stepNumber,
                    {
                      backgroundColor: done ? theme.success : theme.brandSoft,
                    },
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
                <View style={styles.stepCopy}>
                  <ThemedText type="small" style={done ? styles.checkedText : undefined}>
                    {instruction.step}
                  </ThemedText>
                  {instruction.time_minutes ? (
                    <View style={styles.stepMeta}>
                      <Ionicons name="timer-outline" size={12} color={theme.textMuted} />
                      <ThemedText type="small" themeColor="textMuted">
                        {t('mobile.recipe.minutes', { count: instruction.time_minutes })}
                      </ThemedText>
                    </View>
                  ) : null}
                  {instruction.chef_tip ? (
                    <View style={styles.tipRow}>
                      <Ionicons name="bulb-outline" size={13} color={theme.warning} />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.tipText}>
                        {instruction.chef_tip}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Card>

        <CookingTimer initialMinutes={recipe.time_minutes ?? 15} />

        {recipe.chef_tips && recipe.chef_tips.length > 0 ? (
          <Card style={styles.section}>
            <SectionHeader title={t('mobile.recipe.chefTips')} />
            {recipe.chef_tips.map((tip) => (
              <View key={tip} style={styles.tipRow}>
                <Ionicons name="sparkles" size={13} color={theme.brandDark} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.tipText}>
                  {tip}
                </ThemedText>
              </View>
            ))}
          </Card>
        ) : null}

        <RecipeChatCard
          recipeName={recipe.name}
          ingredients={recipe.ingredients.map((ingredient) => ingredient.name)}
          instructions={recipe.instructions.map((instruction) => instruction.step)}
          model={model}
        />
      </Screen>
    </KeyboardAvoidingView>
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
  fill: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  hero: {
    width: '100%',
    height: 210,
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
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.three,
  },
  nutritionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  nutritionItem: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    gap: 2,
  },
  nutritionValue: {
    fontSize: FontSize.lg,
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
  checkedText: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    gap: Spacing.two,
  },
  stepMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  tipText: {
    flex: 1,
  },
});
