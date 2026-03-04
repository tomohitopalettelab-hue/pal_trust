"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '../components/ThemeProvider';
import LoadingSpinner from '../components/LoadingSpinner';
import NoticeToast from '../components/NoticeToast';
import { useNotice } from '../components/useNotice';

type SurveyItem = {
  id: number;
  text: string;
  type: 'rating' | 'free' | 'choice' | string;
  options?: string[];
};

const DEFAULT_SURVEY_ITEMS: SurveyItem[] = [
  { id: 1, text: "接客の満足度はどうでしたか？", type: "rating" },
  { id: 2, text: "具体的に良かった点や改善点を教えてください", type: "free" },
];

const normalizeSurveyItems = (items: unknown): SurveyItem[] => {
  if (!Array.isArray(items) || items.length === 0) {
    return DEFAULT_SURVEY_ITEMS;
  }

  const normalized = items
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as Record<string, unknown>;
      const rawOptions = Array.isArray(row.options) ? row.options : [];
      return {
        id: typeof row.id === 'number' ? row.id : Date.now() + index,
        text: String(row.text || ''),
        type: String(row.type || 'free'),
        options: rawOptions.map((opt) => String(opt).trim()).filter(Boolean),
      } as SurveyItem;
    })
    .filter((item): item is SurveyItem => Boolean(item));

  return normalized.length > 0 ? normalized : DEFAULT_SURVEY_ITEMS;
};

export default function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeCustomerId = searchParams.get('customerId') || searchParams.get('customer') || '';
  const [customerId, setCustomerId] = useState('');
  // --- 状態管理の settings 部分 ---
  const [settings, setSettings] = useState({
    appName: "PAL-TRUST",
    appSubtitle: "SURVEY",
    themeName: "standard",
    minStarsForGoogle: "4",
    aiReviewLength: "150",
    aiReviewTaste: "friendly",      // 初期値
    aiReplyTaste: "professional",  // 初期値
    thanksPageContent: "本日はご来店ありがとうございました！またのお越しを心よりお待ちしております。",
    lowRatingMessage: "ご不便をおかけし申し訳ございません。いただいた内容は責任を持って店長へ報告し、サービスの改善に努めさせていただきます。",
    googleMapUrl: "https://goo.gl/maps/xxxx",
  });

  const [surveyItems, setSurveyItems] = useState<SurveyItem[]>(DEFAULT_SURVEY_ITEMS);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [customerActive, setCustomerActive] = useState<boolean | null>(null);
  const { notice, showNotice, clearNotice } = useNotice();

  const { changeTheme } = useTheme();

  useEffect(() => {
    const loggedIn = localStorage.getItem('customerLoggedIn') === 'true';
    if (!loggedIn) {
      router.replace('/main/login');
      return;
    }
    if (!routeCustomerId) {
      router.replace('/main/login');
      return;
    }
    setCustomerId(routeCustomerId);
    localStorage.setItem('customerId', routeCustomerId);
    setAuthChecking(false);
  }, [router, routeCustomerId]);

  // --- DBから設定を読み込む ---
  useEffect(() => {
    if (authChecking || !customerId) {
      return;
    }

    let isMounted = true;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/customer-status?customerId=${encodeURIComponent(customerId)}`);
        const data = await res.json();
        if (!isMounted) return;
        setCustomerActive(Boolean(data?.exists && data?.isActive));
      } catch {
        if (!isMounted) return;
        setCustomerActive(false);
      }
    };
    checkStatus();

    return () => {
      isMounted = false;
    };
  }, [authChecking, customerId]);

  // --- DBから設定を読み込む ---
  useEffect(() => {
    if (authChecking) {
      return;
    }

    if (customerActive !== true) {
      setIsLoading(false);
      return;
    }

    async function loadSettings() {
      try {
        const res = await fetch(`/api/settings?customerId=${encodeURIComponent(customerId)}`);
        const data = await res.json();
        if (data && data.settings) {
          setSettings(data.settings);
          setSurveyItems(normalizeSurveyItems(data.surveyItems));
        }
      } catch {
        console.error("設定の読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [authChecking, customerId, customerActive]);

  const addSurveyItem = () => {
    if (surveyItems.length < 20) {
      setSurveyItems([...surveyItems, { id: Date.now(), text: "", type: "rating" }]);
    }
  };

  const removeSurveyItem = (id: number) => {
    setSurveyItems(surveyItems.filter(item => item.id !== id));
  };

  const moveSurveyItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setSurveyItems((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const updateSurveyItem = (id: number, fields: Partial<Pick<SurveyItem, 'text' | 'type' | 'options'>>) => {
    setSurveyItems(surveyItems.map(item => item.id === id ? { ...item, ...fields } : item));
  };

  const finalizeSurveyItemOptions = (itemId: number, triggerElement?: HTMLElement | null) => {
    setSurveyItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const options = (item.options || []).map((opt) => opt.trim()).filter(Boolean);
        return { ...item, options };
      })
    );

    const detailsElement = triggerElement?.closest('details');
    if (detailsElement) {
      detailsElement.removeAttribute('open');
    }
  };

  const moveSurveyItemOption = (itemId: number, optionIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? optionIndex - 1 : optionIndex + 1;
    setSurveyItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const options = [...(item.options || [])];
        if (targetIndex < 0 || targetIndex >= options.length) {
          return item;
        }
        const temp = options[optionIndex];
        options[optionIndex] = options[targetIndex];
        options[targetIndex] = temp;
        return { ...item, options };
      })
    );
  };

  const updateSurveyItemOption = (itemId: number, optionIndex: number, value: string) => {
    setSurveyItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const options = [...(item.options || [])];
        options[optionIndex] = value;
        return { ...item, options };
      })
    );
  };

  const addSurveyItemOption = (itemId: number) => {
    setSurveyItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const options = [...(item.options || []), ''];
        return { ...item, options };
      })
    );
  };

  const removeSurveyItemOption = (itemId: number, optionIndex: number) => {
    setSurveyItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const options = [...(item.options || [])].filter((_, index) => index !== optionIndex);
        return { ...item, options };
      })
    );
  };

  // --- DBへ設定を保存する ---
  const handleSave = async () => {
    const sanitizedSurveyItems = surveyItems.filter((item) => String(item.text || '').trim().length > 0);
    if (sanitizedSurveyItems.length !== surveyItems.length) {
      setSurveyItems(sanitizedSurveyItems);
      showNotice('質問文が空の設問を削除して保存します', 'info');
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, settings, surveyItems: sanitizedSurveyItems }),
      });
      if (res.ok) {
        showNotice('保存しました！');
      } else {
        throw new Error();
      }
    } catch {
      showNotice('保存に失敗しました。', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || customerActive === null) {
    return <LoadingSpinner />;
  }

  if (authChecking) {
    return <LoadingSpinner />;
  }

  if (customerActive === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans text-[var(--theme-text)] bg-[var(--theme-bg)]">
        <div className="max-w-md w-full bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-8 text-center space-y-4">
          <h1 className="text-2xl font-black italic">この顧客URLは現在停止中です</h1>
          <p className="text-sm font-bold text-[var(--theme-text)]/70">管理者にお問い合わせください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-[var(--theme-primary)] text-[var(--theme-text)]">
      {notice && (
        <NoticeToast
          message={notice.message}
          variant={notice.variant}
          onClose={clearNotice}
        />
      )}
      {/* 保存中のローディングオーバーレイ */}
      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black italic text-xl text-black tracking-widest">SAVING...</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-6 md:p-12 w-full space-y-10">

        <header>
          <p className="text-xs font-black text-[var(--theme-text)] opacity-60 uppercase tracking-widest">Administrator</p>
          <h1 className="text-4xl font-black italic">システム設定</h1>
        </header>

        {/* 1. 基本・マップ設定 */}
        <section className="bg-[var(--theme-card-bg)] rounded-[2rem] border-3 border-[var(--theme-border)] p-8 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black mb-6 flex items-center gap-2 italic">
            <span className={`w-2 h-6 bg-[var(--theme-primary)] block border border-[var(--theme-border)]`} />
            基本・マップ設定 <span className="text-[10px] text-[var(--theme-text)] opacity-60 ml-2 font-normal italic">BASIC & MAP</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">アプリ名（メイン）</label>
              <input
                type="text"
                value={settings.appName}
                onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none mb-4"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">サブタイトル（イエロー部分）</label>
              <input
                type="text"
                value={settings.appSubtitle}
                onChange={(e) => setSettings({ ...settings, appSubtitle: e.target.value })}
                className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none mb-4"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">Google口コミ誘導の基準（星いくつ以上？）</label>
              <select
                value={settings.minStarsForGoogle}
                onChange={(e) => setSettings({ ...settings, minStarsForGoogle: e.target.value })}
                className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none"
              >
                <option value="5">星5のみ</option>
                <option value="4">星4以上</option>
                <option value="3">星3以上</option>
              </select>
            </div>
          </div>
        </section>

        {/* デザインテーマ選択 */}
        <section className="bg-[var(--theme-card-bg)] rounded-[2rem] border-3 border-[var(--theme-border)] p-8 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black mb-6 flex items-center gap-2 italic">
            <span className={`w-2 h-6 bg-[var(--theme-primary)] block border border-[var(--theme-border)]`} />
            デザインテーマ選択 <span className="text-[10px] text-[var(--theme-text)] opacity-60 ml-2 font-normal italic">DESIGN THEME</span>
          </h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[
              { id: 'standard', name: '標準', color: 'bg-[#F9C11C]', text: 'BLACK' },
              { id: 'minimal', name: 'シンプル', color: 'bg-white', border: 'border-gray-200', text: 'GRAY' },
              { id: 'feminine', name: 'フェミニン', color: 'bg-[#FADADD]', text: 'PINK' },
              { id: 'dark', name: 'ダーク', color: 'bg-[#121212]', border: 'border-[#D4AF37]', text: 'GOLD' },
              { id: 'pop', name: 'ポップ', color: 'bg-[#3B82F6]', text: 'BLUE' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSettings({ ...settings, themeName: t.id });
                  changeTheme(t.id); // プレビュー反映
                }}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200 ${
                  settings.themeName === t.id 
                    ? 'border-[var(--theme-border)] bg-[var(--theme-text)]/5 shadow-[4px_4px_0px_var(--theme-border)] scale-105' 
                    : 'border-transparent bg-[var(--theme-card-bg)] hover:bg-[var(--theme-text)]/5 opacity-60'
                }`}
              >
                <div className={`w-12 h-12 rounded-full ${t.color} ${t.border || 'border-2 border-black'} shadow-sm`} />
                <span className="text-[10px] font-black uppercase tracking-tighter text-center">{t.name}</span>
                {settings.themeName === t.id && (
                  <span className="text-[10px] text-[var(--theme-text)] font-bold">●選択中</span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-[var(--theme-text)] opacity-60 font-bold italic text-center">※選択したテーマがアンケート画面の配色・形状に即座に反映されます。</p>
        </section>

        {/* 2. アンケート項目設定 */}
        <section className="bg-[var(--theme-card-bg)] rounded-[2rem] border-3 border-[var(--theme-border)] p-8 shadow-[8px_8px_0px_var(--theme-border)]">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center items-start gap-3 mb-6">
            <h2 className="text-xl font-black flex items-center gap-2 italic leading-tight break-words">
              <span className={`w-2 h-6 bg-[var(--theme-primary)] block border border-[var(--theme-border)]`} />
              アンケート項目設定 <span className="text-[10px] text-[var(--theme-text)] opacity-60 ml-2 font-normal italic">SURVEY ITEMS</span>
            </h2>
            <button onClick={addSurveyItem} className={`w-full sm:w-auto text-center whitespace-normal leading-tight bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-2 border-[var(--theme-border)] px-4 py-2 rounded-xl font-black text-xs shadow-[3px_3px_0px_var(--theme-border)]`}>
              ＋ 項目を追加
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {surveyItems.map((item, index) => (
              <div key={item.id} className="flex flex-col md:flex-row gap-3 bg-[var(--theme-text)]/5 p-4 border-2 border-[var(--theme-border)] rounded-xl">
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <span className="text-[10px] font-black text-[var(--theme-text)] opacity-60 w-4">{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => moveSurveyItem(index, 'up')}
                    disabled={index === 0}
                    className="px-2 py-1 rounded-lg border-2 border-[var(--theme-border)] text-xs font-black disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSurveyItem(index, 'down')}
                    disabled={index === surveyItems.length - 1}
                    className="px-2 py-1 rounded-lg border-2 border-[var(--theme-border)] text-xs font-black disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <div className="w-full">
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => updateSurveyItem(item.id, { text: e.target.value })}
                    className="w-full bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] px-3 py-2 rounded-lg font-bold text-sm leading-relaxed outline-none"
                    placeholder="質問文を入力してください"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <select
                    value={item.type}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      if (nextType === 'choice') {
                        updateSurveyItem(item.id, {
                          type: nextType,
                          options: item.options && item.options.length > 0 ? item.options : ['はい', 'いいえ'],
                        });
                        return;
                      }
                      updateSurveyItem(item.id, { type: nextType });
                    }}
                    className="w-full sm:w-auto max-w-full bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] px-3 py-1 rounded-lg font-black text-xs outline-none"
                  >
                    <option value="rating">★評価(1-5)</option>
                    <option value="free">自由入力</option>
                    <option value="choice">選択肢</option>
                  </select>
                  <button onClick={() => removeSurveyItem(item.id)} className="text-gray-300 hover:text-red-500 font-black px-2 whitespace-nowrap">×</button>
                </div>
                {item.type === 'choice' && (
                  <div className="w-full md:basis-full mt-2 md:ml-0">
                    <details className="bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-xl p-3">
                      <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-[var(--theme-text)]/70 uppercase">選択肢を編集</span>
                        <span className="text-[10px] font-black text-[var(--theme-text)]/60">{(item.options || []).length}件</span>
                      </summary>

                      <div className="space-y-2 mt-3">
                        {(item.options || []).map((option, optionIndex, options) => (
                          <div key={`${item.id}-opt-${optionIndex}`} className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => moveSurveyItemOption(item.id, optionIndex, 'up')}
                              disabled={optionIndex === 0}
                              className="px-2 py-1 rounded-lg border-2 border-[var(--theme-border)] text-xs font-black disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSurveyItemOption(item.id, optionIndex, 'down')}
                              disabled={optionIndex === options.length - 1}
                              className="px-2 py-1 rounded-lg border-2 border-[var(--theme-border)] text-xs font-black disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateSurveyItemOption(item.id, optionIndex, e.target.value)}
                              className="order-2 sm:order-none basis-full sm:basis-auto w-full sm:flex-1 sm:min-w-0 bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] p-2 rounded-lg font-bold text-sm outline-none"
                              placeholder={`選択肢 ${optionIndex + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeSurveyItemOption(item.id, optionIndex)}
                              className="order-3 sm:order-none px-2 py-1 rounded-lg border-2 border-[var(--theme-border)] text-xs font-black text-red-600"
                            >
                              削除
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addSurveyItemOption(item.id)}
                            className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs"
                          >
                            + 選択肢を追加
                          </button>
                          <button
                            type="button"
                            onClick={(e) => finalizeSurveyItemOptions(item.id, e.currentTarget)}
                            className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs"
                          >
                            完了
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 3. AI設定 */}
        <section className="bg-[var(--theme-card-bg)] rounded-[2rem] border-3 border-[var(--theme-border)] p-8 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black mb-6 flex items-center gap-2 italic">
            <span className={`w-2 h-6 bg-[var(--theme-primary)] block border border-[var(--theme-border)]`} />
            AI口コミ生成テイスト <span className="text-[10px] text-[var(--theme-text)] opacity-60 ml-2 font-normal italic">AI ENGINE</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">生成文字数目安</label>
              <input type="number" value={settings.aiReviewLength} onChange={(e) => setSettings({ ...settings, aiReviewLength: e.target.value })} className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none" />
            </div>

            <div>
              <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">口コミのテイスト（5種）</label>
              {/* 口コミのテイスト選択部分 */}
              <select
                value={settings.aiReviewTaste}
                onChange={(e) => setSettings({ ...settings, aiReviewTaste: e.target.value })}
                className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none"
              >
                <option value="random">🎲 ランダム（AIが自動で選択）</option> {/* 追加 */}
                <option value="friendly">親しみやすい（自然な会話調）</option>
                <option value="polite">丁寧・誠実（しっかりした敬語）</option>
                <option value="energetic">元気・ワクワク（ポジティブ全開）</option>
                <option value="emotional">感動・エモーショナル（心温まる表現）</option>
                <option value="minimal">シンプル（短く端的に）</option>
              </select>
            </div>
          </div>
        </section>

        {/* 4. 低評価時のメッセージ */}
        <section className="bg-[var(--theme-card-bg)] rounded-[2rem] border-3 border-[var(--theme-border)] p-8 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black mb-6 flex items-center gap-2 italic">
            <span className={`w-2 h-6 bg-[var(--theme-primary)] block border border-[var(--theme-border)]`} />
            低評価時のメッセージ <span className="text-[10px] text-[var(--theme-text)] opacity-60 ml-2 font-normal italic">LOW RATING MESSAGE</span>
          </h2>
          <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">星が基準より低いお客様に表示する内容</label>
          <textarea
            rows={3}
            value={settings.lowRatingMessage}
            onChange={(e) => setSettings({ ...settings, lowRatingMessage: e.target.value })}
            className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none resize-none focus:bg-[var(--theme-primary)]/5"
            placeholder="改善を約束するメッセージを入力してください"
          />
        </section>

        {/* 5. サンクスページ設定 */}
        <section className="bg-[var(--theme-card-bg)] rounded-[2rem] border-3 border-[var(--theme-border)] p-8 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black mb-6 flex items-center gap-2 italic">
            <span className={`w-2 h-6 bg-[var(--theme-primary)] block border border-[var(--theme-border)]`} />
            完了画面の設定 <span className="text-[10px] text-[var(--theme-text)] opacity-60 ml-2 font-normal italic">THANK YOU PAGE</span>
          </h2>
          <label className="block text-[10px] font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase">高評価だったお客様に表示する内容</label>
          <textarea
            rows={3}
            value={settings.thanksPageContent}
            onChange={(e) => setSettings({ ...settings, thanksPageContent: e.target.value })}
            className="w-full bg-[var(--theme-text)]/5 border-2 border-[var(--theme-border)] p-4 rounded-xl font-bold outline-none resize-none"
          />
        </section>

        {/* 下部ボタン */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 pb-20">
          <Link href={`/main?customerId=${encodeURIComponent(customerId)}`} className="w-full md:w-auto order-2 md:order-1">
            <button className="w-full md:w-auto bg-[var(--theme-card-bg)] border-3 border-[var(--theme-border)] px-12 py-6 rounded-[2rem] font-black text-xl shadow-[8px_8px_0px_var(--theme-border)] active:scale-95 transition-all">← 戻る</button>
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full md:w-auto order-1 md:order-2 bg-[var(--theme-text)] text-[var(--theme-bg)] px-20 py-6 rounded-[2rem] font-black text-xl shadow-[8px_8px_0px_var(--theme-primary)] active:scale-95 transition-all ${isSaving ? 'opacity-50' : ''}`}
          >
            {isSaving ? "保存中..." : "設定を保存して反映"}
          </button>
        </div>
      </main>
    </div>
  );
}