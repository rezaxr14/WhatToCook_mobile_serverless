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

const SAMPLE_FRIDGE_URL =
  'https://images.unsplash.com/photo-1584473457406-6240486418e9?auto=format&fit=crop&w=800&q=80';
const SAMPLE_COUNTER_URL =
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80';

export const FridgeScannerModal: React.FC<FridgeScannerModalProps> = ({ isOpen, onClose }) => {
  const { refreshPantry, activeAIProvider, setLastScanResult } = usePantry();
  const { success, error, aiToast } = useToast();
  const { t } = useTranslation();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedItems, setDetectedItems] = useState<ScannedIngredient[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setDetectedItems([]);
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
        setSelectedIds(
          res.detected_ingredients
            .map((i) => i.ingredient_id)
            .filter((id): id is number => typeof id === 'number' && id > 0),
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

  const toggleSelect = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((n) => n !== id) : [...current, id],
    );
  };

  const matchedItems = detectedItems.filter(
    (item) => typeof item.ingredient_id === 'number' && item.ingredient_id > 0,
  );

  const handleSelectAll = () => {
    setSelectedIds(matchedItems.map((i) => i.ingredient_id as number));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleAddSelectedToPantry = async () => {
    if (selectedIds.length === 0) {
      error('Please select at least one catalog ingredient to add.');
      return;
    }

    setIsAdding(true);
    try {
      // Only catalog-matched detections can be added. The backend rejects
      // unknown names, and a single failure used to abort the whole batch
      // while leaving the modal open — which is why nothing ever appeared
      // in the pantry.
      const selectedItems = matchedItems.filter((item) =>
        selectedIds.includes(item.ingredient_id as number),
      );
      const ids = selectedItems.map((item) => item.ingredient_id as number);
      if (ids.length === 0) {
        error('None of the selected items are in the ingredient catalog yet.');
        return;
      }

      await pantryApi.addIngredient({ ingredient_ids: ids });
      await refreshPantry();
      const names = selectedItems.map((item) => item.display_name || item.name);
      setLastScanResult({ names, count: ids.length, at: Date.now() });

      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });

      success(
        `Added ${ids.length} scanned ${ids.length === 1 ? 'ingredient' : 'ingredients'} to your pantry.`,
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
    setSelectedIds([]);
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
                      alt="Sample Fridge"
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                    <div>
                      <div className="text-xs font-bold text-stone-900 group-hover:text-brand-600">
                        Stocked Refrigerator
                      </div>
                      <div className="text-[11px] text-stone-400">Eggs, Milk, Cheese, Veggies</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUseSample(SAMPLE_COUNTER_URL)}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-stone-200 hover:border-brand-400 bg-white hover:bg-stone-50 text-left transition-all group"
                  >
                    <img
                      src={SAMPLE_COUNTER_URL}
                      alt="Sample Veggies"
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                    <div>
                      <div className="text-xs font-bold text-stone-900 group-hover:text-brand-600">
                        Kitchen Countertop
                      </div>
                      <div className="text-[11px] text-stone-400">Tomatoes, Onions, Peppers</div>
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
                      const id =
                        typeof item.ingredient_id === 'number' && item.ingredient_id > 0
                          ? item.ingredient_id
                          : null;
                      const matched = id !== null;
                      const isChecked = matched && selectedIds.includes(id as number);
                      return (
                        <div
                          key={`${item.name}-${idx}`}
                          onClick={() => matched && toggleSelect(id as number)}
                          className={`p-3 rounded-2xl border transition-all flex items-center justify-between ${
                            !matched
                              ? 'bg-stone-100/70 border-stone-200 text-stone-400 opacity-70 cursor-not-allowed'
                              : isChecked
                                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-xs cursor-pointer'
                                : 'bg-stone-50 border-stone-200 text-stone-500 opacity-60 cursor-pointer'
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
                              <div className="text-[10px] text-stone-400">
                                {matched
                                  ? `${t(ingredientCategoryKey(item.category))} ${
                                      item.estimated_quantity ? `• ${item.estimated_quantity}` : ''
                                    }`
                                  : 'Not in catalog — skipped'}
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
                      {selectedIds.length} of {matchedItems.length} catalog items selected
                      {matchedItems.length < detectedItems.length
                        ? ` • ${detectedItems.length - matchedItems.length} not in catalog`
                        : ''}
                    </span>

                    <StyledButton
                      $variant="primary"
                      $size="md"
                      onClick={handleAddSelectedToPantry}
                      disabled={isAdding || selectedIds.length === 0}
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
                            Add {selectedIds.length}{' '}
                            {selectedIds.length === 1 ? 'Ingredient' : 'Ingredients'} to Pantry
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
