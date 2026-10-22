import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import type { Locale } from '@whattocook/shared';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/features/i18n/locale-provider';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const { locale, setLocale } = useLocale();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    setSaving(true);
    try {
      await setLocale(selected);
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.six },
        ]}>
        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: theme.brandSoft }]}>
            <Ionicons name="language" size={30} color={theme.brandDark} />
          </View>
          <ThemedText type="subtitle" style={styles.title}>
            {t('mobile.onboarding.title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {t('mobile.onboarding.subtitle')}
          </ThemedText>
        </View>

        <View style={styles.grid}>
          {SUPPORTED_LANGUAGES.map((language) => {
            const active = language.code === selected;
            return (
              <Pressable
                key={language.code}
                onPress={() => {
                  setSelected(language.code);
                  void i18n.changeLanguage(language.code);
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: active ? theme.brandSoft : theme.card,
                    borderColor: active ? theme.brand : theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText style={styles.flag}>{language.flag}</ThemedText>
                <View style={styles.optionCopy}>
                  <ThemedText type="smallBold">{language.nativeName}</ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {language.name}
                  </ThemedText>
                </View>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={theme.brand} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.hint}>
          <Ionicons name="information-circle-outline" size={18} color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.hintText}>
            {t('mobile.settings.languageSub')}
          </ThemedText>
        </Card>

        <Button onPress={() => void handleContinue()} loading={saving} icon="arrow-forward">
          {t('mobile.onboarding.continue')}
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 340,
  },
  grid: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  flag: {
    fontSize: 24,
  },
  optionCopy: {
    flex: 1,
    gap: 1,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  hintText: {
    flex: 1,
  },
});
