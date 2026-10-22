import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { Spacing } from '@/constants/theme';

import { ThemedText } from '../themed-text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function SectionHeader({ title, subtitle, right }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <ThemedText type="smallBold" themeColor="text" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
  },
});
