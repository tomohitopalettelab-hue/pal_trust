"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export type NoticeVariant = 'success' | 'error' | 'info';

export type NoticeState = {
  message: string;
  variant: NoticeVariant;
} | null;

const DEFAULT_DURATION_MS = 2800;

export function useNotice() {
  const [notice, setNotice] = useState<NoticeState>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNotice = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setNotice(null);
  }, []);

  const showNotice = useCallback(
    (message: string, variant: NoticeVariant = 'success', durationMs = DEFAULT_DURATION_MS) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setNotice({ message, variant });
      timeoutRef.current = setTimeout(() => {
        setNotice(null);
        timeoutRef.current = null;
      }, durationMs);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    notice,
    showNotice,
    clearNotice,
  };
}
