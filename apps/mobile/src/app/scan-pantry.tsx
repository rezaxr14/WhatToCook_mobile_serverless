import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useScanPantry } from '@/features/ai/use-ai';
import type { AIScanItem } from '@/features/ai/types';
import { useAuth } from '@/features/auth/auth-provider';
import { useAddPantryIngredients } from '@/features/pantry/use-pantry';
import { useTheme } from '@/hooks/use-theme';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ScanPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function ScanPantryScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const scan = useScanPantry();
  const addPantry = useAddPantryIngredients(user?.id);

  const [photo, setPhoto] = useState<ScanPhoto | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const items = scan.data?.items ?? [];
  const selectableItems = items.filter((item) => item.ingredient_id != null);
  const errorMessage = localError ?? scan.error?.message ?? null;

  const runScan = (next: ScanPhoto) => {
    setPhoto(next);
    setSelectedIds([]);
    setLocalError(null);
    scan.mutate(
      { base64: next.base64, mimeType: next.mimeType },
      {
        onSuccess: (data) => {
          setSelectedIds(
            data.items
              .filter((item) => item.ingredient_id != null)
              .map((item) => item.ingredient_id as number),
          );
        },
      },
    );
  };

  const handleResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      setLocalError(t('mobile.scan.error'));
      return;
    }
    if (asset.base64.length * 0.75 > MAX_IMAGE_BYTES) {
      setLocalError(t('mobile.scan.tooLarge'));
      return;
    }
    const mimeType = asset.mimeType && SUPPORTED_MIME.has(asset.mimeType)
      ? asset.mimeType
      : 'image/jpeg';
    runScan({ uri: asset.uri, base64: asset.base64, mimeType });
  };

  const takePhoto = async () => {
    setLocalError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setLocalError(t('mobile.scan.permissionBody'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.55,
        base64: true,
        exif: false,
      });
      handleResult(result);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('mobile.scan.error'));
    }
  };

  const choosePhoto = async () => {
    setLocalError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.55,
        base64: true,
        exif: false,
      });
      handleResult(result);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('mobile.scan.error'));
    }
  };

  const toggleItem = (item: AIScanItem) => {
    if (item.ingredient_id == null) return;
    const id = item.ingredient_id;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const addSelected = () => {
    if (selectedIds.length === 0) return;
    addPantry.mutate(selectedIds, {
      onSuccess: () => {
        Alert.alert(t('mobile.scan.added'), undefined, [
          {
            text: t('mobile.common.confirm'),
            onPress: () => router.back(),
          },
        ]);
      },
      onError: (error) => setLocalError(error.message),
    });
  };

  const retry = () => {
    setPhoto(null);
    setLocalError(null);
    scan.reset();
    void takePhoto();
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton
          icon="close"
          accessibilityLabel={t('mobile.scan.cancel')}
          onPress={() => router.back()}
        />
      </View>

      <PageHeader
        badge={t('mobile.scan.badge')}
        title={t('mobile.scan.title')}
        subtitle={t('mobile.scan.subtitle')}
      />

      {!photo ? (
        <Card style={styles.intro}>
          <View style={[styles.cameraCircle, { backgroundColor: theme.brandSoft }]}>
            <Ionicons name="camera" size={34} color={theme.brandDark} />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.introCopy}>
            {t('mobile.scan.subtitle')}
          </ThemedText>
          <Button icon="camera-outline" size="lg" onPress={() => void takePhoto()}>
            {t('mobile.scan.camera')}
          </Button>
          <Button
            variant="secondary"
            icon="images-outline"
            onPress={() => void choosePhoto()}>
            {t('mobile.scan.library')}
          </Button>
        </Card>
      ) : (
        <Card padded={false}>
          <View>
            <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" />
            {scan.isPending ? (
              <View style={styles.scanOverlay}>
                <ActivityIndicator color="#ffffff" />
                <ThemedText type="smallBold" style={styles.scanOverlayText}>
                  {t('mobile.scan.scanning')}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <View style={styles.previewActions}>
            <Button variant="secondary" icon="camera-outline" onPress={() => void takePhoto()}>
              {t('mobile.scan.retry')}
            </Button>
            <Button variant="ghost" icon="images-outline" onPress={() => void choosePhoto()}>
              {t('mobile.scan.library')}
            </Button>
          </View>
        </Card>
      )}

      {errorMessage ? (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={20} color={theme.danger} />
            <View style={styles.errorCopy}>
              <ThemedText type="smallBold" themeColor="danger">
                {t('mobile.scan.error')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {errorMessage}
              </ThemedText>
            </View>
          </View>
          <Button variant="secondary" size="sm" onPress={() => void retry()}>
            {t('mobile.scan.retry')}
          </Button>
        </Card>
      ) : null}

      {scan.isPending ? null : scan.isSuccess ? (
        items.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t('mobile.scan.empty')}
            subtitle={t('mobile.scan.emptySub')}
            action={
              <Button variant="secondary" onPress={() => void takePhoto()}>
                {t('mobile.scan.retry')}
              </Button>
            }
          />
        ) : (
          <Card style={styles.results}>
            <View style={styles.resultsHeader}>
              <View style={styles.resultsCopy}>
                <ThemedText type="smallBold" style={styles.resultsTitle}>
                  {t('mobile.scan.reviewTitle')}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  {t('mobile.scan.reviewSub', { count: items.length })}
                </ThemedText>
              </View>
              {selectableItems.length > 0 ? (
                <Pressable
                  onPress={() => setSelectedIds(selectableItems.map((item) => item.ingredient_id as number))}>
                  <ThemedText type="smallBold" themeColor="brandDark">
                    {t('mobile.scan.selectAll')}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {items.map((item, index) => {
              const id = item.ingredient_id ?? null;
              const selectable = id != null;
              const selected = id != null && selectedIds.includes(id);
              const label = item.display_name?.trim() || item.name;
              return (
                <Pressable
                  key={`${label}-${index}`}
                  disabled={!selectable}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: !selectable }}
                  onPress={() => toggleItem(item)}
                  style={[
                    styles.itemRow,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                    !selectable && { opacity: 0.55 },
                  ]}>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: selected ? theme.success : 'transparent',
                        borderColor: selected ? theme.success : theme.borderStrong,
                      },
                    ]}>
                    {selected ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                  </View>
                  <View style={styles.itemCopy}>
                    <ThemedText type="smallBold">{label}</ThemedText>
                    <ThemedText type="small" themeColor="textMuted">
                      {item.category} · {Math.round(item.confidence * 100)}%
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.tag,
                      {
                        backgroundColor: selectable ? theme.successSoft : theme.backgroundElement,
                      },
                    ]}>
                    <ThemedText
                      type="small"
                      themeColor={selectable ? 'success' : 'textMuted'}>
                      {selectable ? t('mobile.scan.matched') : t('mobile.scan.unmatched')}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}

            <Button
              icon="basket-outline"
              loading={addPantry.isPending}
              disabled={selectedIds.length === 0}
              onPress={addSelected}>
              {t('mobile.scan.addSelected', { count: selectedIds.length })}
            </Button>
          </Card>
        )
      ) : null}

      {localError === t('mobile.scan.permissionBody') && Platform.OS !== 'web' ? (
        <Button variant="ghost" icon="settings-outline" onPress={() => void Linking.openSettings()}>
          {t('mobile.scan.permissionSettings')}
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  intro: {
    gap: Spacing.three,
    alignItems: 'center',
  },
  cameraCircle: {
    width: 76,
    height: 76,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: {
    textAlign: 'center',
    maxWidth: 320,
  },
  preview: {
    width: '100%',
    height: 230,
  },
  scanOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28, 25, 23, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  scanOverlayText: {
    color: '#ffffff',
  },
  previewActions: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  errorCard: {
    gap: Spacing.three,
  },
  errorRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  errorCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  results: {
    gap: Spacing.two,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  resultsCopy: {
    flex: 1,
    gap: 2,
  },
  resultsTitle: {
    fontSize: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCopy: {
    flex: 1,
    gap: 1,
  },
  tag: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
});
