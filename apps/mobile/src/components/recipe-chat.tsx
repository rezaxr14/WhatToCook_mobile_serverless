import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import type { AIChatMessage } from '@/features/ai/types';
import { useRecipeChat } from '@/features/ai/use-ai';
import { useIsRtl } from '@/features/i18n/locale-provider';
import { useTheme } from '@/hooks/use-theme';

export interface RecipeChatCardProps {
  recipeName: string;
  ingredients: string[];
  instructions: string[];
  model?: string;
}

/** Inline recipe chat used by both catalog and AI recipe detail screens. */
export function RecipeChatCard({
  recipeName,
  ingredients,
  instructions,
  model,
}: RecipeChatCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isRtl = useIsRtl();
  const textDirection = {
    textAlign: isRtl ? ('right' as const) : ('left' as const),
    writingDirection: isRtl ? ('rtl' as const) : ('ltr' as const),
  };
  const chat = useRecipeChat();
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const sendMessage = () => {
    const message = draft.trim();
    if (!message || chat.isPending) return;

    const history = messages.slice(-12);
    setDraft('');
    setMessages((current) => [...current, { role: 'user', content: message }]);

    chat.mutate(
      {
        recipeName,
        message,
        ingredients,
        instructions,
        history,
        model,
      },
      {
        onSuccess: (response) => {
          setMessages((current) => [
            ...current,
            { role: 'assistant', content: response.reply },
          ]);
        },
        onError: (error) => {
          setMessages((current) => [
            ...current,
            { role: 'assistant', content: error.message || t('mobile.recipe.errorSub') },
          ]);
        },
      },
    );
  };

  return (
    <Card style={styles.section}>
      <SectionHeader title={t('mobile.recipe.chatTitle')} />
      {messages.length === 0 ? (
        <ThemedText type="small" themeColor="textMuted">
          {t('mobile.recipe.chatEmpty')}
        </ThemedText>
      ) : (
        <ScrollView style={styles.chatScroll} nestedScrollEnabled>
          {messages.map((message, index) => (
            <View
              key={`${index}-${message.content.slice(0, 12)}`}
              style={[
                styles.bubble,
                message.role === 'user'
                  ? { backgroundColor: theme.brandSoft, alignSelf: 'flex-end' }
                  : { backgroundColor: theme.backgroundElement, alignSelf: 'flex-start' },
              ]}>
              <ThemedText type="small" style={textDirection}>
                {message.content}
              </ThemedText>
            </View>
          ))}
          {chat.isPending ? (
            <ThemedText type="small" themeColor="textMuted">
              {t('mobile.recipe.thinking')}
            </ThemedText>
          ) : null}
        </ScrollView>
      )}
      <View style={styles.chatInputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('mobile.recipe.chatPlaceholder')}
          placeholderTextColor={theme.textMuted}
          style={[
            styles.chatInput,
            textDirection,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          multiline
          maxLength={4000}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.recipe.send')}
          onPress={sendMessage}
          disabled={chat.isPending || draft.trim().length === 0}
          style={[
            styles.sendButton,
            {
              backgroundColor: theme.brand,
              opacity: chat.isPending || draft.trim().length === 0 ? 0.45 : 1,
            },
          ]}>
          <Ionicons name="send" size={18} color={theme.brandContrast} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  chatScroll: {
    maxHeight: 300,
  },
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
    maxWidth: '90%',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  chatInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    fontSize: FontSize.md,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
