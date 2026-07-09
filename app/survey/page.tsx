"use client";

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { THEMES } from '../components/themes';
import LoadingSpinner from '../components/LoadingSpinner';
import NoticeToast from '../components/NoticeToast';
import { useNotice } from '../components/useNotice';
import Lottery from './Lottery';

export const dynamic = 'force-dynamic';

const DEFAULT_SURVEY_ITEMS = [
  { id: 1, text: '接客の満足度はどうでしたか？', type: 'rating' },
  { id: 2, text: '具体的に良かった点や改善点を教えてください', type: 'free' },
];

type SurveyItem = {
  id: number;
  text: string;
  type: 'rating' | 'free' | 'choice' | string;
  options?: string[];
  multiple?: boolean;
  enabled?: boolean;
};

type AppSettings = {
  themeName?: string;
  appName?: string;
  appSubtitle?: string;
  minStarsForGoogle?: string | number;
  googleMapUrl?: string;           // GoogleマップURL（店舗ページ・任意）
  adminGoogleMapUrl?: string;      // GoogleビジネスプロフィールURL（クチコミ投稿先）＝高評価時の遷移先
  lowRatingMessage?: string;
  industry?: string;
  aiReviewTaste?: string;
  aiReviewLength?: string;
  aiUseEmoji?: boolean;
  aiBannedWords?: string;
  aiPreferredWords?: string;
  lottery?: {
    enabled?: boolean;
    animation?: 'roulette' | 'scratch' | string;
    timing?: 'all' | 'high' | 'low' | string;
    prizes?: { id: string; name: string; probability: number }[];
    loseMessage?: string;
  };
};

// 「口コミを書く」ダイアログを直接開くディープリンクかどうか。
// g.page/r/<CID>/review や search.google.com/local/writereview?placeid=... が該当。
// 単なるマップ共有リンク（maps.app.goo.gl / goo.gl/maps 等）は口コミ投稿画面を開けない。
const isReviewDeepLink = (url?: string): boolean =>
  !!url && /(g\.page\/r\/[^/]+\/review|search\.google\.[a-z.]*\/local\/writereview|[?&]placeid=|\/writereview\b)/i.test(url);

// 高評価時に遷移させる「口コミ投稿先」を決定する。
// 設定欄（adminGoogleMapUrl=投稿先 / googleMapUrl=店舗ページ）が取り違えられていても、
// 2つのURLのうち口コミ投稿ディープリンクを最優先で選ぶ（マップ共有リンクへの誤遷移を防ぐ）。
// どちらも口コミリンクでなければ従来どおり 投稿先→店舗ページ の順でフォールバック。
const pickReviewUrl = (admin?: string, map?: string): string => {
  const a = (admin || '').trim();
  const m = (map || '').trim();
  if (isReviewDeepLink(a)) return a;
  if (isReviewDeepLink(m)) return m;
  return a || m;
};

type AnswerValue = string | number | string[];

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
      return {
        id: typeof row.id === 'number' ? row.id : Date.now() + index,
        text: String(row.text || ''),
        type: String(row.type || 'free'),
        options: Array.isArray(row.options)
          ? row.options.map((opt) => String(opt).trim()).filter(Boolean)
          : [],
        multiple: Boolean(row.multiple),
        enabled: row.enabled === undefined ? true : Boolean(row.enabled),
      } as SurveyItem;
    })
    .filter((item): item is SurveyItem => Boolean(item));

  // 1つ目は必ず★評価・有効状態に矯正（誤って削除されないよう保険）
  if (normalized.length > 0) {
    normalized[0] = { ...normalized[0], type: 'rating', enabled: true };
  }

  // 2つ目以降のみ非表示フィルターを適用
  const result = normalized.length > 0
    ? [normalized[0], ...normalized.slice(1).filter((item) => item.enabled !== false)]
    : normalized;

  return result.length > 0 ? result : DEFAULT_SURVEY_ITEMS;
};

function SurveyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeCustomerId = searchParams.get('customerId') || searchParams.get('customer') || '';
  const isDemo = searchParams.get('demo') === '1';
  // --- 以下、元の状態管理のコードに続きます ---


  // --- 状態管理 ---
  const [step, setStep] = useState(-1);
  const [totalRating, setTotalRating] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [comment, setComment] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiVariants, setAiVariants] = useState<string[]>([]);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [surveySessionId, setSurveySessionId] = useState('');

  // 抽選: 表示中フラグと、抽選完了後に行う遷移を保持
  const [showLottery, setShowLottery] = useState(false);
  const pendingNavRef = React.useRef<(() => void) | null>(null);

  const customerId = routeCustomerId;

  // DBからの設定データ
  const [loading, setLoading] = useState(true);
  const [customerActive, setCustomerActive] = useState<boolean | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [surveyItems, setSurveyItems] = useState<SurveyItem[]>(DEFAULT_SURVEY_ITEMS);
  const { notice, showNotice, clearNotice } = useNotice();

  // --- ここを追加 ---
  // 管理画面の設定(appSettings)にテーマ名があればそれを、なければ standard を使います
  const themeKey = appSettings?.themeName || 'standard';
  const theme = THEMES[themeKey] || THEMES.standard;
  // "..." "・・・" "…" などの無意味な値を空扱いに
  const cleanText = (v: unknown): string => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    if (/^[.．・…\s]+$/.test(s)) return '';
    return s;
  };
  // 優先順位: appName設定 → CRMの会社名 → 空（その場合は表示しない）
  const displayAppName = cleanText(appSettings?.appName) || cleanText(customerName);
  const subtitleRaw = cleanText(appSettings?.appSubtitle);
  const displayAppSubtitle = subtitleRaw.toUpperCase() === 'SURVEY' ? 'アンケート' : (subtitleRaw || 'アンケート');
  // ----------------

  // --- DBから設定（アプリ名・質問事項・基準値）を読み込む ---
  useEffect(() => {
    if (!customerId) {
      return;
    }

    let isActive = true;
    // デモモード: 顧客アクティブ判定をスキップして強制的に有効扱いに
    if (isDemo) {
      setCustomerActive(true);
      return () => { isActive = false; };
    }
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/customer-status?customerId=${encodeURIComponent(customerId)}`);
        const data = await res.json();
        if (!isActive) return;
        setCustomerActive(Boolean(data?.exists && data?.isActive));
        if (data?.customerName) setCustomerName(String(data.customerName));
      } catch {
        if (!isActive) return;
        setCustomerActive(false);
      }
    };
    checkStatus();

    return () => {
      isActive = false;
    };
  }, [customerId, isDemo]);

  // --- DBから設定（アプリ名・質問事項・基準値）を読み込む ---
  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    if (customerActive !== true) {
      setLoading(false);
      return;
    }

    // キャッシュバージョン: v2（古いキャッシュ無効化）
    const cacheKey = `survey-settings-v2:${customerId}`;
    // 旧キャッシュをクリーンアップ
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem(`survey-settings:${customerId}`); } catch {}
    }
    let hasCache = false;
    if (typeof window !== 'undefined') {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // 壊れたキャッシュ（settingsが無い）は無視して再フェッチ
          if (parsed?.settings) {
            setAppSettings(parsed.settings);
            if (Array.isArray(parsed?.surveyItems) && parsed.surveyItems.length > 0) {
              setSurveyItems(normalizeSurveyItems(parsed.surveyItems));
            } else {
              setSurveyItems(DEFAULT_SURVEY_ITEMS);
            }
            hasCache = true;
            setLoading(false);
          } else {
            // 壊れたキャッシュは削除
            window.sessionStorage.removeItem(cacheKey);
            hasCache = false;
          }
        } catch {
          hasCache = false;
        }
      }
    }

    if (!hasCache) {
      setLoading(true);
    }

    let isActive = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 8000);
    const safetyLoadingTimeoutId = setTimeout(() => {
      if (!isActive) return;
      setLoading(false);
    }, 10000);

    async function fetchSettings() {
      try {
        const res = await fetch(`/api/settings?customerId=${encodeURIComponent(customerId)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          if (!isActive) return;
          setSurveyItems(DEFAULT_SURVEY_ITEMS);
          return;
        }

        const data = await res.json();
        if (!isActive) return;
        if (data) {
          if (data.settings) {
            setAppSettings(data.settings);
          }
          setSurveyItems(normalizeSurveyItems(data.surveyItems));
          // settingsが取得できた場合のみキャッシュに保存（壊れたキャッシュを防ぐ）
          if (typeof window !== 'undefined' && data.settings) {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                settings: data.settings,
                surveyItems: normalizeSurveyItems(data.surveyItems),
              })
            );
          }
        }
      } catch (e) {
        if (!isActive) return;
        if (e instanceof DOMException && e.name === 'AbortError') {
          setSurveyItems(DEFAULT_SURVEY_ITEMS);
          return;
        }
        setSurveyItems(DEFAULT_SURVEY_ITEMS);
      } finally {
        if (!isActive) return;
        clearTimeout(timeoutId);
        clearTimeout(safetyLoadingTimeoutId);
        setLoading(false);
      }
    }
    fetchSettings();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      clearTimeout(safetyLoadingTimeoutId);
      controller.abort();
    };
  }, [customerId, customerActive]);

  // body / htmlのスクロール完全禁止（surveyページにいる間のみ）
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // --- ハンドラー ---
  const handleNext = (val: AnswerValue) => {
    setSelectedRating(typeof val === 'number' ? val : null);

    // 最初の質問（ステップ0）の回答をメインの満足度とする
    if (step === 0 && typeof val === 'number') {
      setTotalRating(val);
    }

    // 各質問の回答を保存（currentItemのIDを使用）
    const currentQuestion = surveyItems[step];
    if (currentQuestion) {
      setAnswers({ ...answers, [currentQuestion.id]: val });
    }

    setTimeout(() => {
      setStep(step + 1);
      setSelectedRating(null);
    }, 400);
  };

  // AI口コミ生成（実際のロジックをここに組めます）
  const generateAiComment = async () => {
    setIsGenerating(true);
    setAiVariants([]);
    setSelectedVariantIdx(null);
    try {
      const res = await fetch('/api/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: answers,
          surveyItems: surveyItems,
          settings: appSettings,
        }),
      });
      const data = await res.json();
      const variants: string[] = Array.isArray(data.variants) ? data.variants.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0) : [];
      if (variants.length === 0) {
        setComment("申し訳ありません。文章の作成に失敗しました。");
      } else {
        setAiVariants(variants);
        // 最初の案をデフォルト選択 & テキストエリアに反映
        setSelectedVariantIdx(0);
        setComment(variants[0]);
      }
    } catch (e) {
      console.error("AI生成エラー:", e);
      setComment("申し訳ありません。文章の作成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const selectVariant = (idx: number) => {
    if (idx < 0 || idx >= aiVariants.length) return;
    setSelectedVariantIdx(idx);
    setComment(aiVariants[idx]);
  };

  // --- アンケート最終送信（コピー ＆ マップ遷移） ---
  // --- アンケート最終送信（コピー ＆ マップ遷移） ---
  const submitSurvey = async () => {
    const minStars = Number(appSettings?.minStarsForGoogle || 4);
    const isHighRating = totalRating >= minStars;

    // 保存するコメントを決定するロジック
    let finalComment = "";

    if (isHighRating) {
      // 高評価の場合：AIが生成・編集した「comment」を優先
      finalComment = comment;
    } else {
      // 低評価の場合：前のステップ（surveyItems）で入力した「自由回答」を探してセット
      const freeItem = surveyItems.find((item) => item.type === 'free');
      if (freeItem && answers[freeItem.id]) {
        finalComment = String(answers[freeItem.id]);
      }
    }

    const payload = {
      rating: totalRating,
      comment: finalComment || "", // 何もなければ空文字
      all_answers: answers,
      customerId
    };

    try {
      if (isDemo) {
        // デモモード: DBには保存しないが、UI挙動は通常通り
        showNotice('デモモードのため、回答は保存されませんでした', 'info');
      } else {
        if (isHighRating && surveySessionId) {
          try {
            await fetch('/api/survey-funnel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerId,
                sessionId: surveySessionId,
                action: 'review_click',
              }),
            });
          } catch {}
        }

        // 1. データをDBに保存（ここでレポートに追加されます）
        await fetch('/api/survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      // 高評価ルートの最終アクション（コピー＆Googleマップ遷移）
      const goHighRating = async () => {
        if (comment) {
          try {
            await navigator.clipboard.writeText(comment);
          } catch (err) {
            console.error('コピーに失敗しました', err);
          }
        }
        showNotice('口コミ内容をコピーしました！Google口コミ画面に貼り付けてください', 'success', 5000);
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 高評価は口コミ投稿先へ遷移。2つの設定URLから口コミ投稿リンクを優先選択する
        // （設定欄の取り違えでマップ共有リンクへ誤遷移するのを防ぐ）。
        const reviewUrl = pickReviewUrl(appSettings?.adminGoogleMapUrl, appSettings?.googleMapUrl);
        if (reviewUrl) {
          window.location.href = reviewUrl;
        }
      };
      // 低評価ルートの最終アクション（サンクスページ）
      const goLowRating = () => {
        router.push(`/thanks?rating=${totalRating}&customerId=${encodeURIComponent(customerId)}`);
      };

      const finalNav = isHighRating ? goHighRating : goLowRating;

      // 抽選: 有効かつタイミング条件一致なら、最終遷移の前に抽選を表示
      const lot = appSettings?.lottery;
      const timing = lot?.timing || 'all';
      const lotteryApplies =
        Boolean(lot?.enabled) &&
        Array.isArray(lot?.prizes) &&
        (timing === 'all' || (timing === 'high' && isHighRating) || (timing === 'low' && !isHighRating));

      if (lotteryApplies) {
        pendingNavRef.current = () => { void finalNav(); };
        setShowLottery(true);
        return;
      }

      await finalNav();
    } catch {
      showNotice('送信に失敗しました', 'error');
    }
  };

  // --- UI部品（星評価） ---
  const RatingOptions = ({ onSelect }: { onSelect: (v: number) => void }) => (
    <div className="flex flex-col gap-2 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-md">
      {[5, 4, 3, 2, 1].map((star) => {
        const isSelected = selectedRating === star;
        const getBgColor = (s: number) => {
          if (isSelected) return "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]";
          if (s === 5) return "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]";
          if (s === 4) return "bg-[var(--theme-primary)]/60";
          if (s === 3) return "bg-[var(--theme-primary)]/30";
          if (s === 2) return "bg-[var(--theme-primary)]/10";
          return "bg-[var(--theme-card-bg)]";
        };

        return (
          <button key={star} onClick={() => onSelect(star)}
            className={`h-[76px] md:h-[96px] relative flex items-center justify-between px-5 md:p-6 rounded-2xl border-[length:var(--theme-bw)] border-[var(--theme-border)] font-black text-lg md:text-2xl transition-all duration-200 active:scale-95 shadow-[var(--theme-shadow-sm)] md:shadow-[var(--theme-shadow-md)] ${getBgColor(star)} ${isSelected ? `translate-x-[2px] translate-y-[2px] shadow-none` : ''}`}
          >
            <span className="flex items-center gap-2 md:gap-3">
              <span className="text-2xl md:text-3xl">{star >= 4 ? '😊' : star === 3 ? '😐' : '😞'}</span>
              {star === 5 ? 'とても満足' : star === 4 ? '満足' : star === 3 ? '普通' : star === 2 ? '微妙' : '不満'}
            </span>
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`text-sm md:text-base ${i < star ? 'text-[var(--theme-text)]' : 'text-[var(--theme-border)] opacity-30'}`}>★</span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );

  const ChoiceOptions = ({ item, onSelect }: { item: SurveyItem; onSelect: (v: AnswerValue) => void }) => {
    const options = (item.options || []).filter(Boolean);
    const current = answers[item.id];
    const isMultiple = Boolean(item.multiple);

    if (options.length === 0) {
      return (
        <div className="bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-2xl p-5 text-sm font-bold text-[var(--theme-text)]/70">
          選択肢が設定されていません。管理画面で「選択肢」を追加してください。
        </div>
      );
    }

    if (isMultiple) {
      // 複数選択モード
      const selectedArr: string[] = Array.isArray(current) ? current.map(String) : [];
      const toggleOption = (option: string) => {
        const next = selectedArr.includes(option)
          ? selectedArr.filter((s) => s !== option)
          : [...selectedArr, option];
        setAnswers({ ...answers, [item.id]: next });
      };
      return (
        <div className="flex flex-col gap-2 md:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-md h-full min-h-0">
          <p className="text-[10px] md:text-[11px] font-black text-[var(--theme-text)]/60 uppercase tracking-widest shrink-0">複数選択可（{selectedArr.length}件選択中）</p>
          <div className="flex flex-col gap-2 md:gap-3 flex-1 min-h-0 overflow-y-auto pr-1">
            {options.map((option) => {
              const isSelected = selectedArr.includes(option);
              return (
                <button
                  key={option}
                  onClick={() => toggleOption(option)}
                  className={`shrink-0 min-h-[64px] md:min-h-[80px] px-5 md:p-5 rounded-2xl border-[length:var(--theme-bw)] border-[var(--theme-border)] font-black text-base md:text-xl transition-all duration-200 active:scale-95 shadow-[var(--theme-shadow-sm)] md:shadow-[var(--theme-shadow-md)] flex items-center gap-3 text-left ${isSelected ? 'bg-[var(--theme-primary)] text-[var(--theme-on-primary)] translate-x-[2px] translate-y-[2px] shadow-none' : 'bg-[var(--theme-card-bg)] text-[var(--theme-text)]'}`}
                >
                  <span className={`w-5 h-5 md:w-6 md:h-6 rounded-md border-2 flex items-center justify-center shrink-0 text-xs ${isSelected ? 'border-[var(--theme-on-primary)] bg-[var(--theme-on-primary)]/20' : 'border-[var(--theme-border)]'}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => onSelect(selectedArr)}
            disabled={selectedArr.length === 0}
            className="shrink-0 w-full bg-[var(--theme-text)] text-[var(--theme-bg)] p-4 md:p-5 rounded-2xl font-black text-lg md:text-xl shadow-[var(--theme-shadow-accent-sm)] md:shadow-[var(--theme-shadow-accent)] border-2 border-transparent active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
          >
            次へ進む
          </button>
        </div>
      );
    }

    // 単一選択モード（従来動作）
    const selected = typeof current === 'string' ? current : '';
    return (
      <div className="flex flex-col gap-2 md:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-md h-full min-h-0 overflow-y-auto pr-1">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              onClick={() => onSelect(option)}
              className={`shrink-0 min-h-[64px] md:min-h-[80px] px-5 md:p-5 rounded-2xl border-[length:var(--theme-bw)] border-[var(--theme-border)] font-black text-base md:text-xl transition-all duration-200 active:scale-95 shadow-[var(--theme-shadow-sm)] md:shadow-[var(--theme-shadow-md)] ${isSelected ? 'bg-[var(--theme-primary)] text-[var(--theme-on-primary)] translate-x-[2px] translate-y-[2px] shadow-none' : 'bg-[var(--theme-card-bg)] text-[var(--theme-text)]'}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    );
  };

  if (!customerId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans text-[var(--theme-text)] bg-[var(--theme-bg)]">
        <div className="max-w-md w-full bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-8 text-center space-y-4">
          <h1 className="text-2xl font-black t-italic">このURLは利用できません</h1>
          <p className="text-sm font-bold text-[var(--theme-text)]/70">顧客専用のアンケートURL（customerId付き）からアクセスしてください。</p>
        </div>
      </div>
    );
  }

  if (customerActive === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans text-[var(--theme-text)] bg-[var(--theme-bg)]">
        <div className="max-w-md w-full bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-8 text-center space-y-4">
          <h1 className="text-2xl font-black t-italic">この顧客URLは現在停止中です</h1>
          <p className="text-sm font-bold text-[var(--theme-text)]/70">管理者にお問い合わせください。</p>
        </div>
      </div>
    );
  }

  if (loading || customerActive === null) return <LoadingSpinner />;

  return (
    <div
      className={`${theme.bg} text-[var(--theme-text)] font-sans flex flex-col items-center justify-center p-3 md:p-6 overflow-hidden fixed inset-0`}
      style={{ height: '100dvh' }}
    >
      {notice && (
        <NoticeToast
          message={notice.message}
          variant={notice.variant}
          onClose={clearNotice}
        />
      )}

      {/* デモモードバッジ */}
      {isDemo && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] px-4 py-1.5 bg-yellow-400 text-black border-2 border-black rounded-full text-[10px] font-black shadow-[3px_3px_0_#000]">
          🎬 DEMO MODE（回答は保存されません）
        </div>
      )}

      {showLottery ? (
        <Lottery
          animation={String(appSettings?.lottery?.animation || 'roulette')}
          prizes={(appSettings?.lottery?.prizes || []).filter((p) => p && p.name)}
          loseMessage={String(appSettings?.lottery?.loseMessage || '')}
          customerId={customerId}
          isDemo={isDemo}
          onComplete={() => {
            const nav = pendingNavRef.current;
            pendingNavRef.current = null;
            setShowLottery(false);
            if (nav) nav();
          }}
        />
      ) : step === -1 ? (
        /* --- STEP -1: インパクト抜群のスタート画面 --- */
        <main className={`w-[90%] max-w-md mx-auto ${theme.card} p-5 md:p-10 flex flex-col items-center text-center space-y-4 md:space-y-8 animate-in zoom-in-95 duration-500`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.svg" alt="Pal Trust" className="w-20 h-20 md:w-28 md:h-28 -rotate-3" />
          <div className="space-y-1 md:space-y-2">
            <p className="text-[10px] md:text-xs font-black tracking-[0.3em] uppercase text-gray-400">Feedback System</p>
           <h1 className={`text-3xl md:text-5xl ${theme.text} leading-none tracking-tighter`}>
  {displayAppName && (<>{displayAppName} <br /></>)}
  <span className={theme.accentText}>{displayAppSubtitle}</span>
</h1>
          </div>
          <p className="text-xs md:text-sm font-bold text-gray-500 leading-relaxed">
            あなたの声が、お店を創る。 <br />
            わずか1分で終わる簡単なアンケートに <br />
            ご協力をお願いします。
          </p>
         <button
  onClick={async () => {
    const sessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setSurveySessionId(sessionId);
    if (!isDemo) {
      try {
        await fetch('/api/survey-funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId,
            sessionId,
            action: 'start',
          }),
        });
      } catch {}
    }

    setStep(0);
  }}
  className={`w-full ${theme.button} py-4 md:py-6 text-xl md:text-2xl t-italic`}
>
  START!
</button>
        </main>
      ) : (
        /* --- アンケート本編 --- */
        <div className="w-[90%] max-w-md mx-auto flex flex-col items-center h-full">
          {/* プログレスバー */}
          <div className="w-full mb-3 md:mb-12 shrink-0">
            <div className="h-3 md:h-4 bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-full overflow-hidden shadow-[var(--theme-shadow-sm)]">
              <div className={`h-full bg-[var(--theme-primary)] border-r-2 border-[var(--theme-border)] transition-all duration-500`}
                style={{ width: `${((step + 1) / (surveyItems.length + 1)) * 100}%` }} />
            </div>
          </div>

          <div className="w-full flex-1 flex flex-col min-h-0 justify-center">
            {step < surveyItems.length ? (
              <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col min-h-0 max-h-full gap-3 md:gap-6">
                <div className="shrink-0">
                  <p className="text-xs md:text-sm font-black text-[var(--theme-text)] opacity-60 mb-1 md:mb-2 uppercase t-italic tracking-tighter">Question {step + 1}</p>
                  <h2 className={`text-2xl md:text-3xl font-black leading-tight t-italic ${step === 0 ? 'underline decoration-[var(--theme-primary)] decoration-4 md:decoration-8 underline-offset-4' : ''}`}>
                    {surveyItems[step].text}
                  </h2>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  {surveyItems[step].type === "rating" ? (
                    <RatingOptions onSelect={handleNext} />
                  ) : surveyItems[step].type === "choice" ? (
                    <ChoiceOptions item={surveyItems[step]} onSelect={handleNext} />
                  ) : (
                    <div className="flex flex-col gap-3 md:gap-6 min-h-0">
                      <textarea
                        value={answers[surveyItems[step].id] || ""}
                        onChange={(e) => setAnswers({ ...answers, [surveyItems[step].id]: e.target.value })}
                        className="w-full min-h-[160px] max-h-[260px] md:max-h-[360px] bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[length:var(--theme-bw)] border-[var(--theme-border)] p-3 md:p-5 rounded-2xl text-sm md:text-base font-bold outline-none focus:bg-[var(--theme-primary)]/5 shadow-[var(--theme-shadow-md)] resize-none"
                        placeholder="こちらにご入力ください..."
                      />
                      <button
                        onClick={() => handleNext(answers[surveyItems[step].id])}
                        disabled={!answers[surveyItems[step].id]}
                        className="shrink-0 w-full bg-[var(--theme-text)] text-[var(--theme-bg)] p-4 md:p-6 rounded-2xl font-black text-lg md:text-xl shadow-[var(--theme-shadow-accent)] md:shadow-[var(--theme-shadow-accent)] border-2 border-transparent active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
                      >
                        次へ進む
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* --- 着地画面（高評価/低評価の完全分岐） --- */
              <div className="animate-in zoom-in-95 duration-500 space-y-4 md:space-y-8 h-full flex flex-col justify-center">
                {totalRating >= Number(appSettings?.minStarsForGoogle || 4) ? (
                  /* --- 【高評価ルート】口コミ投稿へ誘導 --- */
                  <>
                    <div className="text-center">
                      <div className="w-14 h-14 md:w-20 md:h-20 bg-[var(--theme-text)] text-[var(--theme-bg)] rounded-2xl md:rounded-[var(--theme-radius)] flex items-center justify-center text-2xl md:text-4xl mx-auto mb-3 md:mb-6 shadow-[var(--theme-shadow-accent)] md:shadow-[var(--theme-shadow-accent)]">✨</div>
                      <h2 className="text-xl md:text-3xl font-black t-italic">高評価ありがとうございます！</h2>
                      <p className="text-[var(--theme-text)] opacity-60 font-bold text-[11px] md:text-xs mt-2 md:mt-4 leading-relaxed">AIが作成した文章をGoogle口コミに投稿しませんか？</p>
                    </div>

                    {/* 3案セレクター（生成後のみ表示） */}
                    {aiVariants.length > 0 && (
                      <div className="flex gap-2">
                        {aiVariants.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => selectVariant(idx)}
                            className={`flex-1 py-2 rounded-xl border-2 text-[11px] font-black transition-all ${
                              selectedVariantIdx === idx
                                ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 shadow-[var(--theme-shadow-sm)]'
                                : 'border-[var(--theme-border)] opacity-60'
                            }`}
                          >
                            案{idx + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="relative bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-2xl md:rounded-[var(--theme-radius)] p-3 md:p-5 shadow-[var(--theme-shadow-md)] md:shadow-[var(--theme-shadow)]">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full h-28 md:h-36 bg-transparent text-[var(--theme-text)] font-bold text-xs md:text-sm outline-none resize-none leading-relaxed"
                        placeholder="AIでおまかせ、またはこちらに入力..."
                      />
                      {aiVariants.length > 0 && !isGenerating && (
                        <p className="text-[9px] text-[var(--theme-text)]/40 mt-1">※選択した案は自由に編集できます</p>
                      )}
                      {isGenerating && (
                        <div className="absolute inset-0 bg-white/90 rounded-2xl md:rounded-[var(--theme-radius)] flex flex-col items-center justify-center gap-2">
                          <div className="w-6 h-6 border-[length:var(--theme-bw)] border-black border-t-[var(--theme-primary)] rounded-full animate-spin"></div>
                          <p className="text-[10px] font-black text-[var(--theme-text)]/60">3案を作成中...</p>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 md:gap-4">
                      <button
                        onClick={generateAiComment}
                        disabled={isGenerating}
                        className="bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[length:var(--theme-bw)] border-[var(--theme-border)] p-3 md:p-5 rounded-2xl font-black text-sm md:text-base shadow-[var(--theme-shadow-sm)] md:shadow-[var(--theme-shadow-md)] active:scale-95 transition-all disabled:opacity-50"
                      >
                        {aiVariants.length > 0 ? '🔄 別の3案を作成' : '✨ AIに文章作成を任せる'}
                      </button>

                      <button
                        onClick={submitSurvey}
                        className="bg-[var(--theme-text)] text-[var(--theme-bg)] p-4 md:p-6 rounded-2xl font-black text-base md:text-xl shadow-[var(--theme-shadow-accent)] md:shadow-[var(--theme-shadow-accent)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
                      >
                        Google口コミを投稿する
                      </button>
                    </div>
                  </>
                ) : (
                  /* --- 【低評価ルート】お詫びと送信のみ --- */
                  <div className="text-center py-6 md:py-10 bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] md:rounded-[var(--theme-radius-lg)] p-5 md:p-8 shadow-[var(--theme-shadow)] md:shadow-[var(--theme-shadow-lg)]">
                    <div className="w-14 h-14 md:w-20 md:h-20 bg-[var(--theme-card-bg)] rounded-2xl md:rounded-[var(--theme-radius)] flex items-center justify-center text-2xl md:text-4xl mx-auto mb-4 md:mb-8 border-[length:var(--theme-bw)] border-[var(--theme-border)] shadow-[var(--theme-shadow-md)] md:shadow-[var(--theme-shadow)] opacity-80">✉️</div>
                    <h2 className="text-xl md:text-2xl font-black t-italic mb-3 md:mb-6">貴重なご意見を<br />ありがとうございます。</h2>
                    <p className="text-[var(--theme-text)] opacity-70 font-bold text-xs md:text-sm leading-relaxed mb-5 md:mb-10 px-2 md:px-4">
                      {appSettings?.lowRatingMessage ?? "..."}
                    </p>
                    <button
                      onClick={submitSurvey}
                      className="w-full bg-[var(--theme-text)] text-[var(--theme-bg)] p-4 md:p-6 rounded-2xl font-black text-base md:text-xl shadow-[var(--theme-shadow-accent)] md:shadow-[var(--theme-shadow-accent)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
                    >
                      送信して終了
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SurveyPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SurveyPageContent />
    </Suspense>
  );
}