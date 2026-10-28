import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  Check,
  CheckCheck,
  AlertCircle,
  Scan,
  ShoppingBag,
  Wand2,
  RefreshCw,
  Eye,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTranslation } from 'react-i18next';
import { ingredientCategoryKey } from '@whattocook/shared';
import { ScannedIngredient } from '../../types/ingredient';
import { pantryApi } from '../../api/pantryApi';
import { usePantry } from '../../context/PantryContext';
import { useToast } from '../../context/ToastContext';
import { StyledButton } from '../common/StyledButton';

interface FridgeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_FRIDGE_URL = `${import.meta.env.BASE_URL}samples/fridge.jpg`;
const SAMPLE_COUNTER_URL = `${import.meta.env.BASE_URL}samples/countertop.jpg`;

export const FridgeScannerModal: React.FC<FridgeScannerModalProps> = ({ isOpen, onClose }) => {
  const { refreshPantry, activeAIProvider, setLastScanResult } = usePantry();
  const { success, error, aiToast } = useToast();
  const { t } = useTranslation();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedItems, setDetectedItems] = useState<ScannedIngredient[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const itemKey = (item: ScannedIngredient) => {
    const id = item.ingredient_id;
    return typeof id === 'number' && id > 0
      ? `catalog:${id}`
      : `new:${item.name.trim().toLowerCase()}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setDetectedItems([]);
      setSelectedKeys([]);
    }
  };

  const handleUseSample = async (url: string) => {
    try {
      setPreviewUrl(url);
      setSelectedFile(null);
      setDetectedItems([]);
      runVisionAnalysis(url);
    } catch (e) {
      console.error(e);
    }
  };

  const runVisionAnalysis = async (customPayload?: File | string) => {
    const target = customPayload || selectedFile || previewUrl;
    if (!target) {
      error('Please select or capture a photo first.');
      return;
    }

    setIsScanning(true);
    setDetectedItems([]);
    setSelectedKeys([]);
    try {
      let res;
      if (typeof target === 'string') {
        // Fetch sample image as blob or pass base64
        const resp = await fetch(target);
        const blob = await resp.blob();
        const file = new File([blob], 'fridge_scan.jpg', { type: 'image/jpeg' });
        res = await pantryApi.scanFridgeImage(file, false, activeAIProvider);
      } else {
        res = await pantryApi.scanFridgeImage(target, false, activeAIProvider);
      }

      if (res.detected_ingredients && res.detected_ingredients.length > 0) {
        setDetectedItems(res.detected_ingredients);
        setSelectedKeys(
          res.detected_ingredients
            .filter((i) => typeof i.ingredient_id === 'number' && i.ingredient_id > 0)
            .map((i) => `catalog:${i.ingredient_id}`),
        );
        aiToast(
          `AI Vision identified ${res.detected_ingredients.length} edible ingredients!`,
          'Visual AI Scan Complete 🔍',
        );
      } else {
        error('No ingredients could be detected in this photo. Try another angle or sample image.');
      }
    } catch (err: any) {
      error(err.message || 'Vision scan encountered an error.');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  };

  const newItems = detectedItems.filter(
    (item) => typeof item.ingredient_id !== 'number' || item.ingredient_id <= 0,
  );

  const handleSelectAll = () => {
    setSelectedKeys(detectedItems.map(itemKey));
  };

  const handleDeselectAll = () => {
    setSelectedKeys([]);
  };

  const handleAddSelectedToPantry = async () => {
    if (selectedKeys.length === 0) {
      error('Please select at least one ingredient to add.');
      return;
    }

    setIsAdding(true);
    try {
      const selectedItems = detectedItems.filter((item) => selectedKeys.includes(itemKey(item)));
      const catalogIds = selectedItems
        .map((item) => item.ingredient_id)
        .filter((id): id is number => typeof id === 'number' && id > 0);
      const customItems = selectedItems.filter(
        (item) => typeof item.ingredient_id !== 'number' || item.ingredient_id <= 0,
      );

      if (catalogIds.length > 0) {
        await pantryApi.addIngredient({ ingredient_ids: catalogIds });
      }
      // Detections that are not in the catalog yet become minimal catalog
      // entries (English name + category) and are added to this pantry too.
      for (const item of customItems) {
        await pantryApi.addCustomIngredient({
          name: item.name,
          category: item.category,
        });
      }

      await refreshPantry();
      const names = selectedItems.map((item) => item.display_name || item.name);
      setLastScanResult({ names, count: selectedItems.length, at: Date.now() });

      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });

      success(
        `Added ${selectedItems.length} scanned ${
          selectedItems.length === 1 ? 'ingredient' : 'ingredients'
        } to your pantry${
          customItems.length > 0
            ? `, including ${customItems.length} new catalog ${
                customItems.length === 1 ? 'entry' : 'entries'
              }`
            : ''
        }.`,
        'Pantry Updated 🛒',
      );
      handleReset();
      onClose();
    } catch (err: any) {
      error(err?.message || 'Failed to add the scanned ingredients. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setDetectedItems([]);
    setSelectedKeys([]);
    setIsScanning(false);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleReset();
          onClose();
        }
      }}
      className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="bg-linear-to-r/srgb from-stone-900 via-stone-850 to-stone-950 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-white">AI Fridge & Counter Scanner</h3>
                <span className="bg-linear-to-r/srgb from-brand-400 to-amber-400 text-stone-950 font-extrabold text-[10px] uppercase px-2 py-0.5 rounded-full">
                  AI Vision
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Snap or upload a photo of your fridge to auto-populate your pantry.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {!previewUrl ? (
            /* Upload & Sample State */
            <div className="space-y-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group border-2 border-dashed border-stone-300 hover:border-brand-500 rounded-3xl p-8 text-center cursor-pointer transition-all bg-stone-50 hover:bg-brand-50/30 flex flex-col items-center justify-center space-y-3"
              >
                <div className="w-16 h-16 rounded-2xl bg-brand-100 group-hover:bg-brand-500 text-brand-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <div className="font-bold text-stone-800 text-base group-hover:text-brand-600 transition-colors">
                    Click to Upload Fridge / Pantry Photo
                  </div>
                  <div className="text-stone-400 text-xs mt-1">
                    Supports JPG, PNG, WEBP from your phone, camera, or files
                  </div>
                </div>
              </div>

              {/* Hidden Inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors"
                >
                  <Camera className="w-4 h-4 text-stone-600" />
                  <span>Snap with Mobile Camera</span>
                </button>
              </div>

              {/* Quick Sample Photos for Testing */}
              <div className="pt-4 border-t border-stone-100 space-y-3">
                <div className="text-xs font-bold text-stone-500 uppercase tracking-wider text-center">
                  Or Test Instantly with Sample Photos
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleUseSample(SAMPLE_FRIDGE_URL)}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-stone-200 hover:border-brand-400 bg-white hover:bg-stone-50 text-left transition-all group"
                  >
                    <img
                      src={SAMPLE_FRIDGE_URL}
                      alt="Sample breakfast plate"
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                    <div>
                      <div className="text-xs font-bold text-stone-900 group-hover:text-brand-600">
                        Breakfast Plate
                      </div>
                      <div className="text-[11px] text-stone-400">Eggs, cheese, herbs</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUseSample(SAMPLE_COUNTER_URL)}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-stone-200 hover:border-brand-400 bg-white hover:bg-stone-50 text-left transition-all group"
                  >
                    <img
                      src={SAMPLE_COUNTER_URL}
                      alt="Sample tomato skillet"
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                    <div>
                      <div className="text-xs font-bold text-stone-900 group-hover:text-brand-600">
                        Tomato Skillet
                      </div>
                      <div className="text-[11px] text-stone-400">Tomatoes, peppers, herbs</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Image Preview & Vision Results */
            <div className="space-y-6">
              {/* Photo Card with Scanning Laser. The photo is never cropped:
                  a blurred cover layer fills the frame while the real image
                  stays fully visible with object-contain. */}
              <div className="relative rounded-2xl overflow-hidden h-72 sm:h-80 bg-stone-900 border border-stone-200 shadow-inner">
                <img
                  src={previewUrl}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-60"
                />
                <img
                  src={previewUrl}
                  alt="Scanned item"
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                    isScanning ? 'opacity-80' : 'opacity-100'
                  }`}
                />

                {/* Animated Scanning Laser Line */}
                {isScanning && (
                  <motion.div
                    initial={{ top: '0%' }}
                    animate={{ top: ['0%', '95%', '0%'] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    className="absolute left-0 right-0 h-1 bg-linear-to-r/srgb from-brand-500 via-amber-400 to-brand-500 shadow-[0_0_15px_#f97316] z-20 pointer-events-none"
                  />
                )}

                {/* Status Overlay */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20">
                  <span className="bg-stone-900/80 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                    {isScanning ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                        <span>AI Vision is inspecting food items...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Photo Ready</span>
                      </>
                    )}
                  </span>

                  <button
                    onClick={handleReset}
                    className="text-xs bg-stone-900/80 hover:bg-stone-900 text-stone-300 hover:text-white px-2.5 py-1 rounded-full backdrop-blur-md transition-colors"
                  >
                    Change Photo
                  </button>
                </div>
              </div>

              {/* Action to trigger scan if not run automatically */}
              {detectedItems.length === 0 && !isScanning && (
                <div className="text-center pt-2">
                  <StyledButton
                    $variant="primary"
                    $size="lg"
                    onClick={() => runVisionAnalysis()}
                    disabled={isScanning}
                  >
                    <Wand2 className="w-5 h-5" />
                    <span>Analyze Photo with Gemini Vision</span>
                  </StyledButton>
                </div>
              )}

              {/* Detected Items List */}
              {detectedItems.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-stone-900 text-sm flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-brand-500" />
                        <span>Detected Ingredients ({detectedItems.length})</span>
                      </h4>
                      <p className="text-stone-500 text-xs">
                        Select the ingredients you want to save to your pantry shelf.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAll}
                        className="text-xs font-bold text-brand-600 hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-stone-300">•</span>
                      <button
                        onClick={handleDeselectAll}
                        className="text-xs font-semibold text-stone-400 hover:text-stone-600"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Ingredients Checkbox Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {detectedItems.map((item, idx) => {
                      const key = itemKey(item);
                      const inCatalog =
                        typeof item.ingredient_id === 'number' && item.ingredient_id > 0;
                      const isChecked = selectedKeys.includes(key);
                      return (
                        <div
                          key={`${item.name}-${idx}`}
                          onClick={() => toggleSelect(key)}
                          className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-xs'
                              : inCatalog
                                ? 'bg-stone-50 border-stone-200 text-stone-600 hover:border-emerald-300'
                                : 'bg-amber-50/60 border-amber-300/80 text-stone-700 hover:border-amber-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-5 h-5 rounded-lg flex items-center justify-center border ${
                                isChecked
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-stone-300'
                              }`}
                            >
                              {isChecked && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate capitalize text-stone-900">
                                {item.display_name || item.name}
                              </div>
                              <div
                                className={`text-[10px] ${
                                  inCatalog ? 'text-stone-400' : 'text-amber-700 font-semibold'
                                }`}
                              >
                                {inCatalog
                                  ? `${t(ingredientCategoryKey(item.category))} ${
                                      item.estimated_quantity ? `• ${item.estimated_quantity}` : ''
                                    }`
                                  : 'New — will be added to the catalog'}
                              </div>
                            </div>
                          </div>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                            {Math.round(item.confidence * 100)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Selected Button */}
                  <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-stone-500">
                      {selectedKeys.length} of {detectedItems.length} ingredients selected
                      {newItems.length > 0
                        ? ` • ${newItems.length} new ${
                            newItems.length === 1 ? 'item' : 'items'
                          } can be added to the catalog`
                        : ''}
                    </span>

                    <StyledButton
                      $variant="primary"
                      $size="md"
                      onClick={handleAddSelectedToPantry}
                      disabled={isAdding || selectedKeys.length === 0}
                    >
                      {isAdding ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving to Pantry...</span>
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="w-4 h-4" />
                          <span>
                            Add {selectedKeys.length}{' '}
                            {selectedKeys.length === 1 ? 'Ingredient' : 'Ingredients'} to Pantry
                          </span>
                        </>
                      )}
                    </StyledButton>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
