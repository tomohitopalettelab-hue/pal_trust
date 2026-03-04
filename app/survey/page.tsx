"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { THEMES } from '../components/themes';
import LoadingSpinner from '../components/LoadingSpinner';
import NoticeToast from '../components/NoticeToast';
import { useNotice } from '../components/useNotice';

const DEFAULT_SURVEY_ITEMS = [
  { id: 1, text: '接客の満足度はどうでしたか？', type: 'rating' },
  { id: 2, text: '具体的に良かった点や改善点を教えてください', type: 'free' },
];

type SurveyItem = {
  id: number;
  text: string;
  type: 'rating' | 'free' | 'choice' | string;
  options?: string[];
};

type AppSettings = {
  themeName?: string;
  appName?: string;
  appSubtitle?: string;
  minStarsForGoogle?: string | number;
  googleMapUrl?: string;
  lowRatingMessage?: string;
};

type AnswerValue = string | number;

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
      } as SurveyItem;
    })
    .filter((item): item is SurveyItem => Boolean(item));

  return normalized.length > 0 ? normalized : DEFAULT_SURVEY_ITEMS;
};

export default function SurveyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeCustomerId = searchParams.get('customerId') || searchParams.get('customer') || '';
  // --- 以下、元の状態管理のコードに続きます ---


  // --- 状態管理 ---
  const [step, setStep] = useState(-1);
  const [totalRating, setTotalRating] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [comment, setComment] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [surveySessionId, setSurveySessionId] = useState('');

  const customerId = routeCustomerId;

  // DBからの設定データ
  const [loading, setLoading] = useState(true);
  const [customerActive, setCustomerActive] = useState<boolean | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [surveyItems, setSurveyItems] = useState<SurveyItem[]>(DEFAULT_SURVEY_ITEMS);
  const { notice, showNotice, clearNotice } = useNotice();

  // --- ここを追加 ---
  // 管理画面の設定(appSettings)にテーマ名があればそれを、なければ standard を使います
  const themeKey = appSettings?.themeName || 'standard';
  const theme = THEMES[themeKey] || THEMES.standard;
  const displayAppName = appSettings?.appName ?? '...';
  const subtitle = String(appSettings?.appSubtitle ?? '...');
  const displayAppSubtitle = subtitle.trim().toUpperCase() === 'SURVEY' ? 'アンケート' : subtitle;
  // ----------------

  // --- DBから設定（アプリ名・質問事項・基準値）を読み込む ---
  useEffect(() => {
    if (!customerId) {
      return;
    }

    let isActive = true;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/customer-status?customerId=${encodeURIComponent(customerId)}`);
        const data = await res.json();
        if (!isActive) return;
        setCustomerActive(Boolean(data?.exists && data?.isActive));
      } catch {
        if (!isActive) return;
        setCustomerActive(false);
      }
    };
    checkStatus();

    return () => {
      isActive = false;
    };
  }, [customerId]);

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

    const cacheKey = `survey-settings:${customerId}`;
    let hasCache = false;
    if (typeof window !== 'undefined') {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.settings) {
            setAppSettings(parsed.settings);
          }
          if (Array.isArray(parsed?.surveyItems) && parsed.surveyItems.length > 0) {
            setSurveyItems(normalizeSurveyItems(parsed.surveyItems));
          } else {
            setSurveyItems(DEFAULT_SURVEY_ITEMS);
          }
          hasCache = true;
          setLoading(false);
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
          setAppSettings(data.settings);
          setSurveyItems(normalizeSurveyItems(data.surveyItems));
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                settings: data.settings || null,
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
    try {
      const res = await fetch('/api/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: answers,
          surveyItems: surveyItems,
          settings: appSettings // これを追加！管理画面の設定を丸ごと送る
        }),
      });
      const data = await res.json();
      setComment(data.comment);
    } catch (e) {
      console.error("AI生成エラー:", e);
      setComment("申し訳ありません。文章の作成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
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

      // 2. 高評価ならコピー ＆ マップ遷移
      if (isHighRating) {
        if (comment) {
          try {
            await navigator.clipboard.writeText(comment);
          } catch (err) {
            console.error('コピーに失敗しました', err);
          }
        }
        if (appSettings?.googleMapUrl) {
          window.open(appSettings.googleMapUrl, '_blank');
        }
      }

      // 3. サンクスページへ移動
      router.push(`/thanks?rating=${totalRating}&customerId=${encodeURIComponent(customerId)}`);
    } catch {
      showNotice('送信に失敗しました', 'error');
    }
  };

  // --- UI部品（星評価） ---
  const RatingOptions = ({ onSelect }: { onSelect: (v: number) => void }) => (
    <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-md">
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
            className={`relative flex items-center justify-between p-6 rounded-2xl border-3 border-[var(--theme-border)] font-black text-xl transition-all duration-200 active:scale-95 shadow-[6px_6px_0px_var(--theme-border)] ${getBgColor(star)} ${isSelected ? `translate-x-[2px] translate-y-[2px] shadow-none` : ''}`}
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">{star >= 4 ? '😊' : star === 3 ? '😐' : '😞'}</span>
              {star === 5 ? '最高！' : star === 4 ? '満足' : star === 3 ? '普通' : star === 2 ? '微妙' : '不満'}
            </span>
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`text-sm ${i < star ? 'text-[var(--theme-text)]' : 'text-[var(--theme-border)] opacity-30'}`}>★</span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );

  const ChoiceOptions = ({ item, onSelect }: { item: SurveyItem; onSelect: (v: string) => void }) => {
    const options = (item.options || []).filter(Boolean);
    const selected = String(answers[item.id] || '');

    if (options.length === 0) {
      return (
        <div className="bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-2xl p-5 text-sm font-bold text-[var(--theme-text)]/70">
          選択肢が設定されていません。管理画面で「選択肢」を追加してください。
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-md">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              onClick={() => onSelect(option)}
              className={`p-5 rounded-2xl border-3 border-[var(--theme-border)] font-black text-lg transition-all duration-200 active:scale-95 shadow-[6px_6px_0px_var(--theme-border)] ${isSelected ? 'bg-[var(--theme-primary)] text-[var(--theme-on-primary)] translate-x-[2px] translate-y-[2px] shadow-none' : 'bg-[var(--theme-card-bg)] text-[var(--theme-text)]'}`}
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
        <div className="max-w-md w-full bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-8 text-center space-y-4">
          <h1 className="text-2xl font-black italic">このURLは利用できません</h1>
          <p className="text-sm font-bold text-[var(--theme-text)]/70">顧客専用のアンケートURL（customerId付き）からアクセスしてください。</p>
        </div>
      </div>
    );
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

  if (loading || customerActive === null) return <LoadingSpinner />;

  return (
    <div className={`min-h-screen ${theme.bg} text-[var(--theme-text)] font-sans flex flex-col items-center justify-center p-6 overflow-hidden`}>
      {notice && (
        <NoticeToast
          message={notice.message}
          variant={notice.variant}
          onClose={clearNotice}
        />
      )}

      {step === -1 ? (
        /* --- STEP -1: インパクト抜群のスタート画面 --- */
        <main className={`w-full max-w-md ${theme.card} p-10 flex flex-col items-center text-center space-y-8 animate-in zoom-in-95 duration-500`}>
          <div className={`w-24 h-24 ${theme.accentBg} border-4 border-[var(--theme-border)] rounded-[2rem] flex items-center justify-center text-5xl shadow-[6px_6px_0px_var(--theme-border)] -rotate-3`}>
            ✨
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black tracking-[0.3em] uppercase text-gray-400">Feedback System</p>
           <h1 className={`text-5xl ${theme.text} leading-none tracking-tighter`}>
  {displayAppName} <br />
  <span className={theme.accentText}>{displayAppSubtitle}</span>
</h1>
          </div>
          <p className="text-sm font-bold text-gray-500 leading-relaxed">
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

    setStep(0);
  }}
  className={`w-full ${theme.button} py-6 text-2xl italic`}
>
  START!
</button>
        </main>
      ) : (
        /* --- アンケート本編 --- */
        <div className="w-full max-w-md flex flex-col items-center">
          {/* プログレスバー */}
          <div className="w-full mb-12">
            <div className="h-4 bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-full overflow-hidden shadow-[4px_4px_0px_var(--theme-border)]">
              <div className={`h-full bg-[var(--theme-primary)] border-r-2 border-[var(--theme-border)] transition-all duration-500`}
                style={{ width: `${((step + 1) / (surveyItems.length + 1)) * 100}%` }} />
            </div>
          </div>

          <div className="w-full flex flex-col justify-center">
            {step < surveyItems.length ? (
              <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-500">
                <p className="text-xs font-black text-[var(--theme-text)] opacity-60 mb-2 uppercase italic tracking-tighter">Question {step + 1}</p>
                <h2 className={`text-3xl font-black leading-tight mb-10 italic ${step === 0 ? 'underline decoration-[var(--theme-primary)] decoration-8 underline-offset-4' : ''}`}>
                  {surveyItems[step].text}
                </h2>

                {surveyItems[step].type === "rating" ? (
                  <RatingOptions onSelect={handleNext} />
                ) : surveyItems[step].type === "choice" ? (
                  <ChoiceOptions item={surveyItems[step]} onSelect={handleNext} />
                ) : (
                  <div className="space-y-6">
                    <textarea
                      rows={5}
                      value={answers[surveyItems[step].id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [surveyItems[step].id]: e.target.value })}
                      className="w-full bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-3 border-[var(--theme-border)] p-5 rounded-2xl font-bold outline-none focus:bg-[var(--theme-primary)]/5 shadow-[6px_6px_0px_var(--theme-border)]"
                      placeholder="こちらにご入力ください..."
                    />
                    <button
                      onClick={() => handleNext(answers[surveyItems[step].id])}
                      disabled={!answers[surveyItems[step].id]}
                      className="w-full bg-[var(--theme-text)] text-[var(--theme-bg)] p-6 rounded-2xl font-black text-xl shadow-[8px_8px_0px_var(--theme-primary)] border-2 border-transparent active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
                    >
                      次へ進む
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* --- 着地画面（高評価/低評価の完全分岐） --- */
              <div className="animate-in zoom-in-95 duration-500 space-y-8">
                {totalRating >= Number(appSettings?.minStarsForGoogle || 4) ? (
                  /* --- 【高評価ルート】口コミ投稿へ誘導 --- */
                  <>
                    <div className="text-center">
                      <div className="w-20 h-20 bg-[var(--theme-text)] text-[var(--theme-bg)] rounded-[2rem] flex items-center justify-center text-4xl mx-auto mb-6 shadow-[8px_8px_0px_var(--theme-primary)]">✨</div>
                      <h2 className="text-3xl font-black italic">高評価ありがとうございます！</h2>
                      <p className="text-[var(--theme-text)] opacity-60 font-bold text-xs mt-4 leading-relaxed">AIが作成した文章をGoogle口コミに投稿しませんか？</p>
                    </div>

                    <div className="relative bg-[var(--theme-card-bg)] border-3 border-[var(--theme-border)] rounded-[2rem] p-5 shadow-[8px_8px_0px_var(--theme-border)]">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full h-32 bg-transparent text-[var(--theme-text)] font-bold text-sm outline-none resize-none leading-relaxed"
                        placeholder="AIでおまかせ、またはこちらに入力..."
                      />
                      {isGenerating && (
                        <div className="absolute inset-0 bg-white/90 rounded-[2rem] flex flex-col items-center justify-center gap-2">
                          <div className="w-6 h-6 border-4 border-black border-t-[var(--theme-primary)] rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4">
                      <button
                        onClick={generateAiComment}
                        className={`bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-3 border-[var(--theme-border)] p-5 rounded-2xl font-black shadow-[6px_6px_0px_var(--theme-border)] active:scale-95 transition-all`}
                      >
                        {comment ? '🔄 再生成する' : '✨ AIに文章作成を任せる'}
                      </button>

                      <button
                        onClick={submitSurvey}
                        className="bg-[var(--theme-text)] text-[var(--theme-bg)] p-6 rounded-2xl font-black text-xl shadow-[8px_8px_0px_var(--theme-primary)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
                      >
                        Google口コミを投稿する
                      </button>
                    </div>
                  </>
                ) : (
                  /* --- 【低評価ルート】お詫びと送信のみ --- */
                  <div className="text-center py-10 bg-[var(--theme-card-bg)] border-4 border-[var(--theme-border)] rounded-[3rem] p-8 shadow-[12px_12px_0px_var(--theme-border)]">
                    <div className="w-20 h-20 bg-[var(--theme-card-bg)] rounded-[2rem] flex items-center justify-center text-4xl mx-auto mb-8 border-3 border-[var(--theme-border)] shadow-[8px_8px_0px_var(--theme-text)] opacity-80">✉️</div>
                    <h2 className="text-2xl font-black italic mb-6">貴重なご意見を<br />ありがとうございます。</h2>
                    <p className="text-[var(--theme-text)] opacity-70 font-bold text-sm leading-relaxed mb-10 px-4">
                      {appSettings?.lowRatingMessage ?? "..."}
                    </p>
                    <button
                      onClick={submitSurvey}
                      className="w-full bg-[var(--theme-text)] text-[var(--theme-bg)] p-6 rounded-2xl font-black text-xl shadow-[8px_8px_0px_var(--theme-primary)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
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