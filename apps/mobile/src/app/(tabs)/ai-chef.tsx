import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGenerateSuggestions, useAiCatalog, useAiUsage } from '@/features/ai/use-ai';
import type { AISuggestedDish } from '@/features/ai/types';
import { useAuth } from '@/features/auth/auth-provider';
import { useLocale } from '@/features/i18n/locale-provider';
import { usePantry } from '@/features/pantry/use-pantry';
import { useTheme } from '@/hooks/use-theme';
import { assignUniqueDishPhotos } from '@/lib/dish-images';

const SERVING_OPTIONS = [2, 4, 6] as const;

export default function AIChefScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const pantry = usePantry(user?.id, locale);
  const catalog = useAiCatalog();
  const usage = useAiUsage(Boolean(user));
  const generate = useGenerateSuggestions();

  const pantryItems = pantry.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [customIngredient, setCustomIngredient] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [servings, setServings] = useState<number>(4);
  const [surprise, setSurprise] = useState<number>(1);
  const [model, setModel] = useState<string | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<AISuggestedDish[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const seeded = useRef(false);

  // Seed the selection from the pantry once it loads. Users can still edit it.
  useEffect(() => {
    if (seeded.current || pantryItems.length === 0) return;
    seeded.current = true;
    setSelected(pantryItems.slice(0, 20).map((item) => item.name));
  }, [pantryItems]);

  const models = catalog.data?.models ?? [];
  const activeModel = model ?? catalog.data?.current_model;
  const photos = assignUniqueDishPhotos(suggestions);
  const remaining = usage.data?.daily.suggestions?.remaining;

  const dietOptions = [
    { value: 'vegetarian', label: t('mobile.ai.dietVegetarian') },
    { value: 'vegan', label: t('mobile.ai.dietVegan') },
    { value: 'gluten-free', label: t('mobile.ai.dietGlutenFree') },
    { value: 'dairy-free', label: t('mobile.ai.dietDairyFree') },
    { value: 'halal', label: t('mobile.ai.dietHalal') },
  ];
  const surpriseLabels = [
    t('mobile.ai.surprise0'),
    t('mobile.ai.surprise1'),
    t('mobile.ai.surprise2'),
    t('mobile.ai.surprise3'),
  ];

  const allNames = [
    ...selected.filter((name) => !pantryItems.some((item) => item.name === name)),
    ...pantryItems.map((item) => item.name),
  ];

  const toggleSelected = (name: string) => {
    if (!selected.includes(name) && selected.length >= 50) {
      setNotice(t('mobile.ai.selectIngredients'));
      return;
    }
    setNotice(null);
    setSelected((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name],
    );
  };

  const toggleDiet = (value: string) => {
    setDietary((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  };

  const addCustomIngredient = () => {
    const value = customIngredient.trim();
    if (!value) return;
    if (selected.length >= 50) {
      setNotice(t('mobile.ai.selectIngredients'));
      return;
    }
    setSelected((current) => (current.includes(value) ? current : [...current, value]));
    setCustomIngredient('');
    setNotice(null);
  };

  const handleGenerate = () => {
    if (selected.length === 0) {
      setNotice(t('mobile.ai.selectIngredients'));
      return;
    }
    setNotice(null);
    Keyboard.dismiss();
    generate.mutate(
      {
        ingredients: selected,
        dietary,
        servings,
        surprise,
        model,
        forceRefresh: suggestions.length > 0,
      },
      {
        onSuccess: (data) => setSuggestions(data.recipes),
      },
    );
  };

  return (
    <Screen>
      <PageHeader
        badge={t('mobile.ai.badge')}
        title={t('mobile.ai.title')}
        subtitle={t('mobile.ai.subtitle')}
        right={
          <View style={[styles.spark, { backgroundColor: theme.brandSoft }]}>
            <Ionicons name="sparkles" size={20} color={theme.brandDark} />
          </View>
        }
      />

      {remaining !== null && remaining !== undefined ? (
        <View style={[styles.quota, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="flash" size={14} color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('mobile.ai.remaining', { count: remaining })}
          </ThemedText>
        </View>
      ) : null}

      <Card style={styles.builder}>
        <SectionHeader
          title={t('mobile.ai.ingredients')}
          subtitle={t('mobile.ai.selected', { count: selected.length })}
          right={
            pantryItems.length > 0 ? (
              <Pressable
                onPress={() => setSelected(pantryItems.slice(0, 20).map((item) => item.name))}>
                <ThemedText type="smallBold" themeColor="brandDark">
                  {t('mobile.ai.usePantry', { count: Math.min(pantryItems.length, 20) })}
                </ThemedText>
              </Pressable>
            ) : undefined
          }
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {allNames.map((name) => (
            <Chip
              key={name}
              label={name}
              selected={selected.includes(name)}
              onPress={() => toggleSelected(name)}
            />
          ))}
        </ScrollView>

        <View style={styles.addRow}>
          <TextField
            value={customIngredient}
            onChangeText={setCustomIngredient}
            placeholder={t('mobile.ai.customPlaceholder')}
            icon="add"
            autoCapitalize="none"
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={addCustomIngredient}
            containerStyle={styles.addField}
          />
          <Button size="sm" variant="secondary" fullWidth={false} onPress={addCustomIngredient}>
            {t('mobile.ai.add')}
          </Button>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <SectionHeader title={t('mobile.ai.dietary')} />
        <View style={styles.wrapRow}>
          {dietOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={dietary.includes(option.value)}
              onPress={() => toggleDiet(option.value)}
            />
          ))}
        </View>

        <SectionHeader title={t('mobile.ai.servings')} />
        <View style={styles.segment}>
          {SERVING_OPTIONS.map((value) => {
            const active = servings === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setServings(value)}
                style={[
                  styles.segmentItem,
                  {
                    backgroundColor: active ? theme.brandSoft : theme.backgroundElement,
                    borderColor: active ? theme.brand : theme.border,
                  },
                ]}>
                <ThemedText type="smallBold" themeColor={active ? 'brandDark' : 'textSecondary'}>
                  {value}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader
          title={t('mobile.ai.surprise')}
          subtitle={surpriseLabels[surprise]}
        />
        <View style={styles.segment}>
          {surpriseLabels.map((label, index) => {
            const active = surprise === index;
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSurprise(index)}
                style={[
                  styles.surpriseItem,
                  {
                    backgroundColor: active ? theme.brandSoft : theme.backgroundElement,
                    borderColor: active ? theme.brand : theme.border,
                  },
                ]}>
                <ThemedText type="small" themeColor={active ? 'brandDark' : 'textMuted'}>
                  {index}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {models.length > 1 ? (
          <>
            <SectionHeader
              title={t('mobile.ai.model')}
              subtitle={activeModel ?? undefined}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {models.map((option) => (
                <Chip
                  key={option.id}
                  label={option.displayName}
                  selected={activeModel === option.id}
                  onPress={() => setModel(option.id)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {notice ? (
          <ThemedText type="small" themeColor="danger">
            {notice}
          </ThemedText>
        ) : null}

        <Button
          icon="sparkles"
          size="lg"
          loading={generate.isPending}
          onPress={handleGenerate}>
          {generate.isPending ? t('mobile.ai.generating') : t('mobile.ai.generate')}
        </Button>
      </Card>

      {generate.isError ? (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={20} color={theme.danger} />
            <View style={styles.errorCopy}>
              <ThemedText type="smallBold" themeColor="danger">
                {t('mobile.ai.error')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {generate.error.message}
              </ThemedText>
            </View>
          </View>
          <Button variant="secondary" size="sm" onPress={handleGenerate}>
            {t('mobile.ai.retry')}
          </Button>
        </Card>
      ) : null}

      {generate.isPending ? (
        <Card>
          <Loading label={t('mobile.ai.generating')} />
        </Card>
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title={t('mobile.ai.empty')}
          subtitle={t('mobile.ai.emptySub')}
        />
      ) : (
        <View style={styles.results}>
          <SectionHeader title={t('mobile.ai.results')} subtitle={t('mobile.ai.resultsSub')} />
          {suggestions.map((dish, index) => (
            <Pressable
              key={`${dish.name}-${index}`}
              onPress={() =>
                router.push({
                  pathname: '/ai-recipe/[name]',
                  params: { name: dish.name, model: model ?? '', servings: String(servings) },
                })
              }
              style={({ pressed }) => [pressed && { opacity: 0.88 }]}>
              <Card padded={false} style={styles.dishCard}>
                <Image
                  source={{ uri: photos[index] }}
                  style={styles.dishImage}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.dishBody}>
                  <View style={styles.dishTitleRow}>
                    <ThemedText type="smallBold" style={styles.dishTitle}>
                      {dish.name}
                    </ThemedText>
                    <Ionicons name="arrow-forward" size={16} color={theme.brandDark} />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    {dish.short_description}
                  </ThemedText>
                  <View style={styles.metaRow}>
                    <Meta icon="globe-outline" text={dish.cuisine} />
                    <Meta icon="speedometer-outline" text={dish.difficulty} />
                    {dish.prep_time ? <Meta icon="time-outline" text={dish.prep_time} /> : null}
                    {dish.model_used ? (
                      <Meta icon="hardware-chip-outline" text={dish.model_used} />
                    ) : null}
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Meta({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={12} color={theme.textMuted} />
      <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  spark: {
    width: 42,
    height: 42,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  builder: {
    gap: Spacing.three,
  },
  chipRow: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  addField: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  segment: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segmentItem: {
    flex: 1,
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surpriseItem: {
    flex: 1,
    height: 34,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    gap: Spacing.three,
  },
  errorRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  errorCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  results: {
    gap: Spacing.three,
  },
  dishCard: {
    borderRadius: Radius.xl,
  },
  dishImage: {
    width: '100%',
    height: 168,
  },
  dishBody: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  dishTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dishTitle: {
    flex: 1,
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '100%',
  },
});
