"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import LoadingSpinner from '../components/LoadingSpinner';

type ThanksSettings = {
  minStarsForGoogle?: string | number;
  thanksPageContent?: string;
  lowRatingMessage?: string;
};

function ThanksContent() {
  const searchParams = useSearchParams();
  const rating = Number(searchParams.get('rating') || 0);
  const customerId = searchParams.get('customerId') || searchParams.get('customer') || 'default';
  const [appSettings, setAppSettings] = useState<ThanksSettings | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch(`/api/settings?customerId=${encodeURIComponent(customerId)}`);
        const data = await res.json();
        if (data) setAppSettings(data.settings);
      } catch (e) {
        console.error(e);
      }
    }
    fetchSettings();
  }, [customerId]);

  const isHighRating = rating >= Number(appSettings?.minStarsForGoogle || 4);

  return (
    <main className="w-full max-w-md bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius-lg)] p-12 shadow-[var(--theme-shadow-lg)] flex flex-col items-center text-center space-y-8 animate-in zoom-in-95 duration-500 text-[var(--theme-text)]">
      
      <div className="w-24 h-24 bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-full flex items-center justify-center text-5xl shadow-[var(--theme-shadow-md)]">
        {isHighRating ? "✨" : "🙏"}
      </div>

      <div className="space-y-4">
        <h1 className="text-4xl font-black t-italic uppercase tracking-tighter">
          {isHighRating ? "THANK YOU!" : "MESSAGE"}
        </h1>
        <div className="bg-[var(--theme-primary)] text-[var(--theme-on-primary)] inline-block px-4 py-1 transform -skew-x-12 border-2 border-[var(--theme-border)]">
          <p className="text-xs font-black uppercase tracking-widest t-italic">
            {isHighRating ? "口コミへのご協力感謝します" : "アンケート完了"}
          </p>
        </div>
      </div>

      <p className="text-sm font-bold text-[var(--theme-text)]/70 leading-relaxed t-italic">
        {isHighRating 
          ? (appSettings?.thanksPageContent ?? "...")
          : (appSettings?.lowRatingMessage ?? "...")
        }
      </p>

      {/* ボタン類をすべて削除しました。これでアンケートフローが完結します。 */}
    </main>
  );
}

export default function ThanksPage() {
  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans flex flex-col items-center justify-center p-6">
      <Suspense fallback={<LoadingSpinner />}>
        <ThanksContent />
      </Suspense>
      
      <footer className="mt-12 text-[10px] font-black text-[var(--theme-text)]/30 uppercase tracking-widest t-italic">
        Powered by PAL-TRUST System
      </footer>
    </div>
  );
}