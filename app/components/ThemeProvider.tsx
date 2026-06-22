'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { THEMES } from './themes';
import { usePathname, useSearchParams } from 'next/navigation';

type ThemeContextType = {
  theme: typeof THEMES.standard;
  changeTheme: (key: string) => void;
  setCustomColor: (hex: string | null) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES.standard,
  changeTheme: () => {},
  setCustomColor: () => {},
});

// テーマごとのCSS変数定義（色 + 構造トークン）
const THEME_COLORS: Record<string, React.CSSProperties> = {
  // 1. 現行ブルータル
  standard: {
    '--theme-primary': '#F9C11C',
    '--theme-on-primary': '#000000',
    '--theme-bg': '#F4F4F4',
    '--theme-text': '#111111',
    '--theme-card-bg': '#FFFFFF',
    '--theme-border': '#000000',
    '--theme-shadow': '8px 8px 0 var(--theme-border)',
    '--theme-shadow-md': '6px 6px 0 var(--theme-border)',
    '--theme-shadow-sm': '4px 4px 0 var(--theme-border)',
    '--theme-shadow-lg': '12px 12px 0 var(--theme-border)',
    '--theme-shadow-accent': '8px 8px 0 var(--theme-primary)',
    '--theme-shadow-accent-sm': '4px 4px 0 var(--theme-primary)',
    '--theme-radius': '2rem',
    '--theme-radius-lg': '3rem',
    '--theme-bw': '3px',
    '--theme-italic': 'italic',
  } as React.CSSProperties,
  // 2. リファインド・ブルータル（進化版）
  refined: {
    '--theme-primary': '#F9C11C',
    '--theme-on-primary': '#111111',
    '--theme-bg': '#FFFEF7',
    '--theme-text': '#111111',
    '--theme-card-bg': '#FFFFFF',
    '--theme-border': '#111111',
    '--theme-shadow': '5px 5px 0 var(--theme-border)',
    '--theme-shadow-md': '4px 4px 0 var(--theme-border)',
    '--theme-shadow-sm': '3px 3px 0 var(--theme-border)',
    '--theme-shadow-lg': '8px 8px 0 var(--theme-border)',
    '--theme-shadow-accent': '5px 5px 0 var(--theme-primary)',
    '--theme-shadow-accent-sm': '3px 3px 0 var(--theme-primary)',
    '--theme-radius': '1.75rem',
    '--theme-radius-lg': '2.25rem',
    '--theme-bw': '2px',
    '--theme-italic': 'italic',
  } as React.CSSProperties,
  // 3. ミニマル・クリーン
  minimal: {
    '--theme-primary': '#1C1C22',
    '--theme-on-primary': '#FFFFFF',
    '--theme-bg': '#FBFBFC',
    '--theme-text': '#1C1C22',
    '--theme-card-bg': '#FFFFFF',
    '--theme-border': '#E5E7EB',
    '--theme-shadow': '0 6px 20px rgba(0,0,0,.07)',
    '--theme-shadow-md': '0 4px 14px rgba(0,0,0,.06)',
    '--theme-shadow-sm': '0 2px 8px rgba(0,0,0,.05)',
    '--theme-shadow-lg': '0 10px 30px rgba(0,0,0,.08)',
    '--theme-shadow-accent': '0 6px 18px rgba(28,28,34,.14)',
    '--theme-shadow-accent-sm': '0 2px 8px rgba(28,28,34,.10)',
    '--theme-radius': '1rem',
    '--theme-radius-lg': '1.25rem',
    '--theme-bw': '1px',
    '--theme-italic': 'normal',
  } as React.CSSProperties,
  // 4. ソフト・ラウンド
  soft: {
    '--theme-primary': '#FF8FA3',
    '--theme-on-primary': '#FFFFFF',
    '--theme-bg': '#FFF6EC',
    '--theme-text': '#5A4038',
    '--theme-card-bg': '#FFFFFF',
    '--theme-border': '#F3D9CE',
    '--theme-shadow': '0 10px 24px rgba(233,138,90,.20)',
    '--theme-shadow-md': '0 6px 16px rgba(233,138,90,.16)',
    '--theme-shadow-sm': '0 3px 10px rgba(233,138,90,.14)',
    '--theme-shadow-lg': '0 14px 30px rgba(233,138,90,.22)',
    '--theme-shadow-accent': '0 8px 20px rgba(255,143,163,.35)',
    '--theme-shadow-accent-sm': '0 3px 10px rgba(255,143,163,.30)',
    '--theme-radius': '1.75rem',
    '--theme-radius-lg': '2.25rem',
    '--theme-bw': '1px',
    '--theme-italic': 'normal',
  } as React.CSSProperties,
  // 5. ダーク・プレミアム
  premium: {
    '--theme-primary': '#D4AF37',
    '--theme-on-primary': '#1A1407',
    '--theme-bg': '#0E0E12',
    '--theme-text': '#FFFFFF',
    '--theme-card-bg': '#17171D',
    '--theme-border': '#3A3A42',
    '--theme-shadow': '0 12px 30px rgba(0,0,0,.55)',
    '--theme-shadow-md': '0 8px 22px rgba(0,0,0,.5)',
    '--theme-shadow-sm': '0 4px 14px rgba(0,0,0,.45)',
    '--theme-shadow-lg': '0 16px 40px rgba(0,0,0,.6)',
    '--theme-shadow-accent': '0 8px 24px rgba(212,175,55,.35)',
    '--theme-shadow-accent-sm': '0 3px 12px rgba(212,175,55,.30)',
    '--theme-radius': '1.25rem',
    '--theme-radius-lg': '1.5rem',
    '--theme-bw': '1px',
    '--theme-italic': 'italic',
  } as React.CSSProperties,
  // 6. ポップ・ブルー（青系・元気）
  pop: {
    '--theme-primary': '#3B82F6',
    '--theme-on-primary': '#FFFFFF',
    '--theme-bg': '#EFF6FF',
    '--theme-text': '#1E3A8A',
    '--theme-card-bg': '#FFFFFF',
    '--theme-border': '#C7DCFB',
    '--theme-shadow': '0 10px 24px rgba(59,130,246,.22)',
    '--theme-shadow-md': '0 6px 16px rgba(59,130,246,.18)',
    '--theme-shadow-sm': '0 3px 10px rgba(59,130,246,.15)',
    '--theme-shadow-lg': '0 14px 30px rgba(59,130,246,.24)',
    '--theme-shadow-accent': '0 8px 20px rgba(59,130,246,.40)',
    '--theme-shadow-accent-sm': '0 3px 10px rgba(59,130,246,.34)',
    '--theme-radius': '1.5rem',
    '--theme-radius-lg': '2rem',
    '--theme-bw': '1px',
    '--theme-italic': 'normal',
  } as React.CSSProperties,
};

// 旧テーマキー → 新テーマキーの後方互換マップ（pop は新青テーマとして復活）
const LEGACY_THEME_MAP: Record<string, string> = {
  feminine: 'soft',
  dark: 'premium',
};

// アクセント色の明度から、その上に乗せる文字色（黒/白）を判定
const contrastOn = (hex: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // 相対輝度（簡易）
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#FFFFFF';
};

// 任意のキーを有効な新テーマキーへ解決
const resolveThemeKey = (key: string | null | undefined): string => {
  if (!key) return 'standard';
  if (THEME_COLORS[key]) return key;
  if (LEGACY_THEME_MAP[key]) return LEGACY_THEME_MAP[key];
  return 'standard';
};

export const useTheme = () => useContext(ThemeContext);

function getCustomerIdFromParams(params: URLSearchParams) {
  return params.get('customerId') || params.get('customer') || '';
}

function getStoredThemeKey(customerId: string) {
  if (typeof window === 'undefined') {
    return 'standard';
  }
  const scopedKey = customerId ? window.localStorage.getItem(`themeKey:${customerId}`) : null;
  const defaultKey = window.localStorage.getItem('themeKey:default');
  return resolveThemeKey(scopedKey || defaultKey || 'standard');
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [themeKey, setThemeKey] = useState<string>('standard');
  const [customColor, setCustomColorState] = useState<string | null>(null);
  const lastManualChangeRef = useRef(0);

  useLayoutEffect(() => {
    const customerId = getCustomerIdFromParams(searchParams);
    setThemeKey(getStoredThemeKey(customerId));
  }, [pathname, searchParams]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 5000);

    const currentManualVersion = lastManualChangeRef.current;
    const customerId = getCustomerIdFromParams(searchParams);
    const url = customerId
      ? `/api/settings?customerId=${encodeURIComponent(customerId)}`
      : '/api/settings';

    const fetchSettings = async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          // 設定データは { settings: { themeName: '...' } } の形式
          const settings = data?.settings;
          if (
            isActive &&
            currentManualVersion === lastManualChangeRef.current
          ) {
            if (settings?.themeName) {
              const resolved = resolveThemeKey(settings.themeName);
              setThemeKey(resolved);
              if (customerId) {
                window.localStorage.setItem(`themeKey:${customerId}`, resolved);
              } else {
                window.localStorage.setItem('themeKey:default', resolved);
              }
            }
            // カスタムアクセント色（任意）
            const cc = typeof settings?.themeColor === 'string' ? settings.themeColor.trim() : '';
            setCustomColorState(/^#?[0-9a-fA-F]{6}$/.test(cc) ? (cc.startsWith('#') ? cc : `#${cc}`) : null);
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };
    fetchSettings();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [pathname, searchParams]);

  const resolvedKey = resolveThemeKey(themeKey);
  const theme = THEMES[resolvedKey] || THEMES.standard;
  const baseStyles = THEME_COLORS[resolvedKey] || THEME_COLORS.standard;
  // カスタムアクセント色があれば --theme-primary と on-primary を上書き
  const themeStyles: React.CSSProperties = customColor
    ? ({ ...baseStyles, '--theme-primary': customColor, '--theme-on-primary': contrastOn(customColor) } as React.CSSProperties)
    : baseStyles;

  const changeTheme = (rawKey: string) => {
    const key = resolveThemeKey(rawKey);
    lastManualChangeRef.current += 1;
    setThemeKey(key);
    const customerId = getCustomerIdFromParams(searchParams);
    if (customerId) {
      window.localStorage.setItem(`themeKey:${customerId}`, key);
    } else {
      window.localStorage.setItem('themeKey:default', key);
    }
  };

  const setCustomColor = (hex: string | null) => {
    lastManualChangeRef.current += 1; // API再フェッチでの上書きを防ぐ
    if (!hex) { setCustomColorState(null); return; }
    const t = hex.trim();
    setCustomColorState(/^#?[0-9a-fA-F]{6}$/.test(t) ? (t.startsWith('#') ? t : `#${t}`) : null);
  };

  return (
    <ThemeContext.Provider value={{ theme, changeTheme, setCustomColor }}>
      <div 
        id="theme-provider-root"
        className={`min-h-screen w-full ${theme.bg} ${theme.text} transition-colors duration-500`}
        style={themeStyles}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}