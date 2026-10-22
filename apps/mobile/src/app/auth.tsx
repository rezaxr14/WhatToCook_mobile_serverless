import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, continueAsGuest, isConfigured, error, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const busy = submitting || guestLoading;

  const switchMode = () => {
    setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
    setMessage(null);
    clearError();
  };

  const handleSubmit = async () => {
    setMessage(null);
    clearError();

    if (!email.includes('@')) {
      setMessage(t('mobile.auth.email'));
      return;
    }
    if (password.length < 6) {
      setMessage(t('mobile.auth.passwordPlaceholder'));
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        const result = await signUp(email, password);
        if (result.needsEmailConfirmation) setMessage(t('mobile.auth.checkEmail'));
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t('mobile.common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuest = async () => {
    setMessage(null);
    clearError();
    setGuestLoading(true);
    try {
      await continueAsGuest();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t('mobile.auth.guestError'));
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.six },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: theme.brand }]}>
            <Ionicons name="restaurant" size={30} color={theme.brandContrast} />
          </View>
          <ThemedText type="subtitle" style={styles.title}>
            {t('mobile.auth.title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {t('mobile.auth.subtitle')}
          </ThemedText>
        </View>

        {!isConfigured ? (
          <Card style={{ backgroundColor: theme.warningSoft, borderColor: theme.warning }}>
            <ThemedText type="small" style={{ color: theme.warning }}>
              Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env.local.
            </ThemedText>
          </Card>
        ) : null}

        <Card style={styles.form}>
          <TextField
            label={t('mobile.auth.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('mobile.auth.emailPlaceholder')}
            icon="mail-outline"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label={t('mobile.auth.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('mobile.auth.passwordPlaceholder')}
            icon="lock-closed-outline"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            right={
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color={theme.textMuted}
                />
              </Pressable>
            }
          />

          {message || error ? (
            <View style={[styles.message, { backgroundColor: theme.dangerSoft }]}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
              <ThemedText type="small" style={[styles.messageText, { color: theme.danger }]}>
                {message ?? error}
              </ThemedText>
            </View>
          ) : null}

          <Button
            onPress={() => void handleSubmit()}
            loading={submitting}
            disabled={busy || !isConfigured}>
            {mode === 'signIn' ? t('mobile.auth.signIn') : t('mobile.auth.signUp')}
          </Button>

          <Pressable onPress={switchMode} style={styles.switchLink} disabled={busy}>
            <ThemedText type="small" themeColor="brandDark">
              {mode === 'signIn' ? t('mobile.auth.switchToSignUp') : t('mobile.auth.switchToSignIn')}
            </ThemedText>
          </Pressable>
        </Card>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <ThemedText type="small" themeColor="textMuted">
            {t('mobile.auth.or')}
          </ThemedText>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        </View>

        <Button
          variant="secondary"
          icon="sparkles-outline"
          onPress={() => void handleGuest()}
          loading={guestLoading}
          disabled={busy || !isConfigured}>
          {t('mobile.auth.continueAsGuest')}
        </Button>
        <ThemedText type="small" themeColor="textMuted" style={styles.guestHint}>
          {t('mobile.auth.guestHint')}
        </ThemedText>

        {guestLoading ? (
          <View style={styles.guestLoading}>
            <ActivityIndicator size="small" color={theme.brand} />
            <ThemedText type="small" themeColor="textSecondary">
              {t('mobile.auth.guestLoading')}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
  brand: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 340,
  },
  form: {
    gap: Spacing.three,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  messageText: {
    flex: 1,
  },
  switchLink: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  guestHint: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing.four,
  },
  guestLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
