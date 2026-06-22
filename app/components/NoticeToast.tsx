"use client";

import React from 'react';
import { NoticeVariant } from './useNotice';

type NoticeToastProps = {
  message: string;
  variant?: NoticeVariant;
  onClose: () => void;
};

export default function NoticeToast({ message, variant = 'success', onClose }: NoticeToastProps) {
  const isError = variant === 'error';
  const isInfo = variant === 'info';

  const toneClass = isError
    ? 'bg-red-100 text-red-800'
    : isInfo
      ? 'bg-[var(--theme-card-bg)] text-[var(--theme-text)]'
      : 'bg-[var(--theme-primary)] text-[var(--theme-on-primary)]';

  const icon = isError ? '⚠' : isInfo ? 'ℹ' : '✓';

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] w-[92vw] max-w-md animate-in fade-in slide-in-from-top-2 duration-200">
      <div
        className={`w-full px-5 py-3 rounded-2xl border-2 border-[var(--theme-border)] shadow-[var(--theme-shadow-md)] font-black text-sm ${toneClass}`}
      >
        <div className="flex items-center gap-3">
          <span className="shrink-0">{icon}</span>
          <p className="flex-1 leading-snug">{message}</p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs font-black opacity-70 hover:opacity-100"
            aria-label="閉じる"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
