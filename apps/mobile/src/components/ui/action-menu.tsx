import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: IoniconName;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export interface ActionMenuProps {
  visible: boolean;
  title?: string;
  cancelLabel: string;
  items: ActionMenuItem[];
  onClose: () => void;
}

/**
 * Native-feeling bottom action sheet. Used for contextual menus (sorting, item
 * actions) where an inline row of buttons would crowd the screen.
 */
export function ActionMenu({ visible, title, cancelLabel, items, onClose }: ActionMenuProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const select = (item: ActionMenuItem) => {
    onClose();
    item.onPress();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: insets.bottom + Spacing.three,
            },
          ]}
          onPress={() => {}}
        >
          {title ? (
            <ThemedText type="smallBold" themeColor="textMuted" style={styles.title}>
              {title}
            </ThemedText>
          ) : null}

          {items.map((item, index) => (
            <Pressable
              key={item.key}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: item.selected, disabled: item.disabled }}
              disabled={item.disabled}
              onPress={() => select(item)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                },
                pressed && { backgroundColor: theme.backgroundSelected },
                item.disabled && styles.disabled,
              ]}
            >
              {item.icon ? (
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.destructive ? theme.danger : theme.textSecondary}
                />
              ) : null}
              <ThemedText
                type="smallBold"
                style={[styles.label, item.destructive && { color: theme.danger }]}
              >
                {item.label}
              </ThemedText>
              {item.selected ? <Ionicons name="checkmark" size={20} color={theme.brand} /> : null}
            </Pressable>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
                backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              },
            ]}
          >
            <ThemedText type="smallBold" themeColor="textSecondary">
              {cancelLabel}
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingTop: Spacing.two,
  },
  title: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    minHeight: 48,
  },
  label: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
});
