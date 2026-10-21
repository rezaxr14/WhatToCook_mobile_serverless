import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Bot, Clock3, X } from 'lucide-react';

interface TelegramConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The Telegram bot is a post-web milestone (M10). This modal keeps the
 * reference app's entry point but does not call the removed Django endpoint;
 * it explains the current status instead of failing with a 404.
 */
export const TelegramConnectModal: React.FC<TelegramConnectModalProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden my-auto"
      >
        <div className="bg-linear-to-r/srgb from-sky-600 via-sky-500 to-sky-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shadow-inner">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Telegram AI Chef Bot</h3>
              <p className="text-sky-100 text-xs mt-0.5">
                Cook and manage your pantry straight from Telegram!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-amber-500 text-white flex items-center justify-center">
              <Clock3 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-amber-900">
                Telegram bot is coming in M10
              </div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                The web app is fully usable without it. Pantry matching, recipe scaling and
                the synced grocery list already work in the browser.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 space-y-2">
            <div className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider">
              Commands arriving with the bot
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                <span className="font-bold text-stone-800 font-mono">/cook</span>
                <p className="text-[10px] text-stone-500 mt-0.5">Instant recipe ideas</p>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                <span className="font-bold text-stone-800 font-mono">/pantry</span>
                <p className="text-[10px] text-stone-500 mt-0.5">View stocked items</p>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                <span className="font-bold text-stone-800 font-mono">/add &lt;item&gt;</span>
                <p className="text-[10px] text-stone-500 mt-0.5">Stock your shelf</p>
              </div>
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                <span className="font-bold text-stone-800 font-mono">/remove &lt;item&gt;</span>
                <p className="text-[10px] text-stone-500 mt-0.5">Delete ingredient</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};
