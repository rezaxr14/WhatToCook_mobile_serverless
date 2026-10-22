import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { MatchedRecipeCard } from '@/components/matched-recipe-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Loading } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useCanCook } from '@/features/cook/use-can-cook';
import { useLocale } from '@/features/i18n/locale-provider';
import { useTheme } from '@/hooks/use-theme';

export default function CookScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const canCook = useCanCook(user?.id, locale);
  const result = canCook.data;
  const full = result?.full ?? [];
  const partial = result?.partial ?? [];
  const hasMatches = full.length + partial.length > 0;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={canCook.isRefetching}
          onRefresh={() => void canCook.refetch()}
          tintColor={theme.brand}
          colors={[theme.brand]}
        />
      }>
      <PageHeader
        badge={t('mobile.cook.badge')}
        title={t('mobile.cook.title')}
        subtitle={t('mobile.cook.subtitle')}
        right={
          <IconButton
            icon="refresh"
            accessibilityLabel={t('mobile.cook.refresh')}
            onPress={() => void canCook.refetch()}
          />
        }
      />

      <Pressable onPress={() => router.push('/recipes')}>
        <Card style={styles.catalogCard}>
          <View style={[styles.catalogIcon, { backgroundColor: theme.brandSoft }]}>
            <Ionicons name="book-outline" size={20} color={theme.brandDark} />
          </View>
          <View style={styles.catalogCopy}>
            <ThemedText type="smallBold">{t('mobile.recipes.browseTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('mobile.recipes.browseSub')}
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Card>
      </Pressable>

      {canCook.isPending ? (
        <Loading label={t('mobile.common.loading')} />
      ) : canCook.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('mobile.common.error')}
          subtitle={canCook.error.message}
          action={
            <Button variant="secondary" onPress={() => void canCook.refetch()}>
              {t('mobile.common.retry')}
            </Button>
          }
        />
      ) : !hasMatches ? (
        <EmptyState
          icon="restaurant-outline"
          title={t('mobile.cook.empty')}
          subtitle={t('mobile.cook.emptySub')}
          action={
            <Button onPress={() => router.navigate('/')} icon="add-circle-outline">
              {t('mobile.pantry.add')}
            </Button>
          }
        />
      ) : (
        <>
          {full.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title={t('mobile.cook.fullTitle')}
                subtitle={t('mobile.cook.full', { count: result?.totalFull ?? full.length })}
              />
              {full.map((recipe) => (
                <MatchedRecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onPress={() =>
                    router.push({
                      pathname: '/recipe/[id]',
                      params: { id: String(recipe.id) },
                    })
                  }
                />
              ))}
            </View>
          ) : null}

          {partial.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title={t('mobile.cook.partialTitle')}
                subtitle={t('mobile.cook.partial', {
                  count: result?.totalPartial ?? partial.length,
                })}
              />
              {partial.map((recipe) => (
                <MatchedRecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onPress={() =>
                    router.push({
                      pathname: '/recipe/[id]',
                      params: { id: String(recipe.id) },
                    })
                  }
                />
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() => router.navigate('/')}
            style={({ pressed }) => [styles.footerLink, pressed && { opacity: 0.7 }]}>
            <ThemedText type="small" themeColor="brandDark">
              {t('mobile.pantry.title')} →
            </ThemedText>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  catalogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  catalogIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogCopy: {
    flex: 1,
    gap: 2,
  },
  footerLink: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
