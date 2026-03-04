"use client";

import React from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '実行する',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] p-6 shadow-[10px_10px_0px_var(--theme-border)] space-y-5">
        <div>
          <h3 className="text-xl font-black italic">{title}</h3>
          <p className="mt-2 text-sm font-bold text-[var(--theme-text)]/70">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] font-black text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl border-2 border-red-500 bg-red-50 text-red-700 font-black text-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
