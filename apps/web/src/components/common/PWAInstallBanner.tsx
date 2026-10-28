import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Global connectivity status. The install affordance lives in
 * QuickActionsWidget so it sits beside Grocery/Telegram instead of covering
 * them with a bottom-right banner.
 */
export const PWAInstallBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {isOffline && (
        <div className="fixed bottom-4 left-4 z-50 bg-stone-900 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-pulse">
          <WifiOff className="w-4 h-4" />
          <span>Offline Kitchen Mode (Cached Recipes Active)</span>
        </div>
      )}
    </>
  );
};
