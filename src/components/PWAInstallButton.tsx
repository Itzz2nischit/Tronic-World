import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'hero' }> = ({
  variant = 'hero',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'compact'
            ? 'inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0'
            : 'inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install Android App</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-4 h-4 shrink-0" />
        <span>Get Mobile App</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">
                Install Tronic World on {isIOS ? 'iPhone / iPad' : 'Android'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {isIOS ? (
              <ol className="space-y-2 text-sm text-slate-600 list-decimal pl-5">
                <li>Open this store in Safari on your iPhone or iPad.</li>
                <li>Tap the Share button in the browser toolbar.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-sm text-slate-600 list-decimal pl-5">
                <li>Open Tronic World in Chrome on your Android phone.</li>
                <li>Tap the browser menu (three dots) in the top right.</li>
                <li>Tap Install app or Add to Home screen for instant offline catalog access.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
