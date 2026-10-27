import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Warm kitchen palette; the hash keeps a dish on the same colour every render. */
const POSTER_COLORS = ['#c2410c', '#b45309', '#a16207', '#4d7c0f', '#0f766e', '#7e22ce', '#be123c'];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return POSTER_COLORS[Math.abs(hash) % POSTER_COLORS.length]!;
}

export interface DishImageProps {
  /** Remote/cached photo. When missing or broken a local poster is drawn. */
  uri?: string | null;
  /** Dish name used for the poster label and its colour. */
  name: string;
  style?: StyleProp<ViewStyle>;
  /** Glyph shown on the poster, e.g. `leaf-outline` for produce. */
  icon?: IconName;
  /** Hide the name on small posters (list thumbnails). */
  showLabel?: boolean;
}

/**
 * Dish photography with a guaranteed local fallback.
 *
 * Photo hosts are blocked on some networks and AI suggestions have no photo at
 * all, so a failed/missing image must never leave an empty grey box. The
 * fallback is pure React Native: no asset download, no network.
 */
export function DishImage({
  uri,
  name,
  style,
  icon = 'restaurant-outline',
  showLabel = true,
}: DishImageProps) {
  const [failed, setFailed] = useState(false);

  // A new suggestion can reuse the same card component. Retry the new URI
  // instead of keeping the previous failure state forever.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={style as StyleProp<never>}
        contentFit="cover"
        transition={200}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[styles.poster, { backgroundColor: colorFor(name || 'dish') }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}>
      <Ionicons name={icon} size={44} color="rgba(255,255,255,0.35)" style={styles.posterIcon} />
      {showLabel && name ? (
        <ThemedText type="smallBold" numberOfLines={2} style={styles.posterLabel}>
          {name}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: Spacing.three,
  },
  posterIcon: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.two,
  },
  posterLabel: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
  },
});
