import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useIsRtl } from '@/features/i18n/locale-provider';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  error,
  icon,
  right,
  containerStyle,
  style,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const isRtl = useIsRtl();
  const direction = {
    textAlign: isRtl ? ('right' as const) : ('left' as const),
    writingDirection: isRtl ? ('rtl' as const) : ('ltr' as const),
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}>
        {icon ? <Ionicons name={icon} size={18} color={theme.textMuted} /> : null}
        <TextInput
          placeholderTextColor={theme.textMuted}
          style={[styles.input, direction, { color: theme.text }, style]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  inputRow: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    paddingVertical: Spacing.two,
  },
});
