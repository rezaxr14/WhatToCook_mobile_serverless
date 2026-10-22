import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { isRtlLocale, type Locale } from '@whattocook/shared';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useLocale } from '@/features/i18n/locale-provider';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const theme = useTheme();

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const appName = Constants.expoConfig?.name ?? 'WhatToCook';

  const handleLanguage = (code: Locale) => {
    if (code === locale) return;
    const wasRtl = isRtlLocale(locale);
    const willRtl = isRtlLocale(code);
    void setLocale(code).then(() => {
      if (wasRtl !== willRtl) {
        Alert.alert(t('mobile.settings.language'), t('mobile.settings.restartHint'));
      }
    });
  };

  const confirmSignOut = () => {
    Alert.alert(t('mobile.settings.signOut'), t('mobile.settings.signOutConfirm'), [
      { text: t('mobile.common.cancel'), style: 'cancel' },
      {
        text: t('mobile.settings.signOut'),
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  };

  return (
    <Screen>
      <PageHeader title={t('mobile.settings.title')} subtitle={t('mobile.settings.account')} />

      <Card style={styles.accountCard}>
        <View style={[styles.avatar, { backgroundColor: theme.brandSoft }]}>
          <ThemedText type="subtitle" style={{ color: theme.brandDark }}>
            {(user?.username || 'G').slice(0, 1).toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.accountCopy}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {user?.username ?? t('mobile.settings.guest')}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
            {user?.isAnonymous || !user?.email
              ? t('mobile.settings.anonymous')
              : user.email}
          </ThemedText>
        </View>
        <Ionicons name="person-circle-outline" size={26} color={theme.textMuted} />
      </Card>

      <SectionHeader
        title={t('mobile.settings.language')}
        subtitle={t('mobile.settings.languageSub')}
      />
      <Card padded={false}>
        {SUPPORTED_LANGUAGES.map((language, index) => (
          <Pressable
            key={language.code}
            onPress={() => handleLanguage(language.code)}
            style={({ pressed }) => [
              styles.languageRow,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <ThemedText style={styles.flag}>{language.flag}</ThemedText>
            <View style={styles.languageCopy}>
              <ThemedText type="smallBold">{language.nativeName}</ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                {language.name}
              </ThemedText>
            </View>
            {language.code === locale ? (
              <Ionicons name="checkmark-circle" size={22} color={theme.brand} />
            ) : (
              <Ionicons name="ellipse-outline" size={22} color={theme.borderStrong} />
            )}
          </Pressable>
        ))}
      </Card>

      <Button variant="danger" icon="log-out-outline" onPress={confirmSignOut}>
        {t('mobile.settings.signOut')}
      </Button>

      <SectionHeader title={t('mobile.settings.about')} />
      <Card padded={false}>
        <View style={styles.aboutRow}>
          <Ionicons name="restaurant-outline" size={20} color={theme.brandDark} />
          <ThemedText type="small" style={styles.aboutLabel}>
            {appName}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            {t('mobile.settings.version', { version: appVersion })}
          </ThemedText>
        </View>
        <View
          style={[
            styles.aboutRow,
            { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
          ]}>
          <Ionicons name="cloud-done-outline" size={20} color={theme.accent} />
          <ThemedText type="small" style={styles.aboutLabel}>
            {t('mobile.settings.server')}
          </ThemedText>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCopy: {
    flex: 1,
    gap: 2,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  flag: {
    fontSize: 22,
  },
  languageCopy: {
    flex: 1,
    gap: 1,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  aboutLabel: {
    flex: 1,
  },
});
