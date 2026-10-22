import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

export interface PageHeaderProps {
  badge?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function PageHeader({ badge, title, subtitle, right }: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.copy}>
          {badge ? (
            <View style={styles.badge}>
              <Ionicons name="sparkles" size={12} color={theme.brandDark} />
              <ThemedText type="small" themeColor="brandDark" style={styles.badgeText}>
                {badge}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
        </View>
        {right}
      </View>
      {subtitle ? (
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  badgeText: {
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontSize: 10,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    maxWidth: 520,
  },
});
