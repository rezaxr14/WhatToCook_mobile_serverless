import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { MatchedRecipeCard } from '@/components/matched-recipe-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Loading } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
                <MatchedRecipeCard key={recipe.id} recipe={recipe} />
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
                <MatchedRecipeCard key={recipe.id} recipe={recipe} />
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
  footerLink: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
