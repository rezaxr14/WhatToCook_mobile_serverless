import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatDuration, remainingSeconds } from '@/features/recipes/timer';
import { useTheme } from '@/hooks/use-theme';

export interface CookingTimerProps {
  initialMinutes?: number;
  label?: string;
}

/** In-app step timer with pause, reset and quick time additions. */
export function CookingTimer({ initialMinutes = 15, label }: CookingTimerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const initialSeconds = Math.max(60, Math.round(initialMinutes * 60));

  const [duration, setDuration] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const completed = useRef(false);

  const running = endsAt !== null;
  const left = running ? remainingSeconds(endsAt, now) : remaining;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (!running || left > 0 || completed.current) return;
    completed.current = true;
    setEndsAt(null);
    setRemaining(0);
    Vibration.vibrate(400);
    Alert.alert(label ?? t('mobile.recipe.timerTitle'), t('mobile.recipe.timerDone'));
  }, [label, left, running, t]);

  const toggle = () => {
    if (running) {
      setRemaining(left);
      setEndsAt(null);
      return;
    }
    if (left === 0) {
      completed.current = false;
      setDuration(initialSeconds);
      setRemaining(initialSeconds);
      setEndsAt(Date.now() + initialSeconds * 1000);
      return;
    }
    completed.current = false;
    setEndsAt(Date.now() + left * 1000);
  };

  const reset = () => {
    completed.current = false;
    setEndsAt(null);
    setDuration(initialSeconds);
    setRemaining(initialSeconds);
  };

  const add = (seconds: number) => {
    completed.current = false;
    setDuration((current) => current + seconds);
    if (running) {
      setEndsAt((current) => (current ?? Date.now()) + seconds * 1000);
    } else {
      setRemaining((current) => current + seconds);
    }
  };

  const progress = duration > 0 ? Math.min(1, Math.max(0, 1 - left / duration)) : 0;
  const status =
    left === 0
      ? t('mobile.recipe.timerReady')
      : running
        ? t('mobile.recipe.timerRunning')
        : t('mobile.recipe.timerPaused');

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="flame-outline" size={16} color={theme.brand} />
          <ThemedText type="smallBold">{label ?? t('mobile.recipe.timerTitle')}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textMuted">
          {status}
        </ThemedText>
      </View>

      <View style={styles.timeRow}>
        <ThemedText style={styles.time}>{formatDuration(left)}</ThemedText>
      </View>

      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: theme.brand, width: `${Math.round(progress * 100)}%` },
          ]}
        />
      </View>

      <View style={styles.controlRow}>
        <Button
          size="sm"
          icon={running ? 'pause' : left === 0 ? 'refresh' : 'play'}
          onPress={toggle}
          fullWidth={false}
          style={styles.startButton}>
          {running
            ? t('mobile.recipe.timerPause')
            : left === 0
              ? t('mobile.recipe.timerRestart')
              : t('mobile.recipe.timerStart')}
        </Button>
        <IconButton
          icon="refresh-outline"
          accessibilityLabel={t('mobile.recipe.timerReset')}
          onPress={reset}
        />
      </View>

      <View style={styles.addRow}>
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => add(60)}>
          {t('mobile.recipe.timerAddOne')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => add(300)}>
          {t('mobile.recipe.timerAddFive')}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  timeRow: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  time: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  startButton: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
