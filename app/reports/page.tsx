"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import LoadingSpinner from '../components/LoadingSpinner';

type SurveyItem = {
  id: number;
  text: string;
  type: string;
};

type SurveyReview = {
  id: number;
  rating: number;
  comment: string | null;
  category: string | null;
  created_at: string;
  all_answers?: Record<string, unknown> | null;
};

type SortBy = 'dateDesc' | 'dateAsc' | 'ratingDesc' | 'ratingAsc' | 'answersDesc';
type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeCustomerId = searchParams.get('customerId') || searchParams.get('customer') || '';
  // --- 状態管理 ---
  const [allReviews, setAllReviews] = useState<SurveyReview[]>([]);
  const [surveyItems, setSurveyItems] = useState<SurveyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('dateDesc');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [selectedFunnelMonth, setSelectedFunnelMonth] = useState<string>('all');
  const [availableFunnelMonths, setAvailableFunnelMonths] = useState<string[]>([]);
  const [reviewPostRate, setReviewPostRate] = useState(0);
  const [startedCount, setStartedCount] = useState(0);
  const [reviewClickCount, setReviewClickCount] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [customerActive, setCustomerActive] = useState<boolean | null>(null);

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

  // --- DBからデータ取得 ---
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

  // --- DBからデータ取得 ---
  useEffect(() => {
    if (authChecking) {
      return;
    }

    if (customerActive !== true) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [surveysRes, settingsRes] = await Promise.all([
          fetch(`/api/surveys-get?customerId=${encodeURIComponent(customerId)}`),
          fetch(`/api/settings?customerId=${encodeURIComponent(customerId)}`),
        ]);
        const funnelQuery = selectedFunnelMonth === 'all'
          ? `/api/survey-funnel?customerId=${encodeURIComponent(customerId)}`
          : `/api/survey-funnel?customerId=${encodeURIComponent(customerId)}&month=${encodeURIComponent(selectedFunnelMonth)}`;
        const funnelRes = await fetch(funnelQuery);
        const surveysData: SurveyReview[] = await surveysRes.json();
        const settingsData = await settingsRes.json();
        const funnelData = await funnelRes.json();

        if (Array.isArray(surveysData)) {
          setAllReviews(surveysData);
        } else {
          setAllReviews([]);
        }

        if (Array.isArray(settingsData?.surveyItems)) {
          setSurveyItems(settingsData.surveyItems);
        } else {
          setSurveyItems([]);
        }

        setReviewPostRate(Number(funnelData?.reviewPostRate || 0));
        setStartedCount(Number(funnelData?.startedCount || 0));
        setReviewClickCount(Number(funnelData?.reviewClickCount || 0));
        setAvailableFunnelMonths(Array.isArray(funnelData?.availableMonths) ? funnelData.availableMonths : []);
      } catch (error) {
        console.error("データ取得失敗:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [customerId, authChecking, selectedFunnelMonth, customerActive]);

  // --- 統計計算 ---
  const totalCount = allReviews.length;
  const avgRating = totalCount > 0 ? (allReviews.reduce((acc, curr) => acc + curr.rating, 0) / totalCount).toFixed(1) : "0.0";

  const questionOrder = new Map<string, number>();
  const questionLabel = new Map<string, string>();
  const questionType = new Map<string, string>();
  surveyItems.forEach((item, index) => {
    questionOrder.set(String(item.id), index);
    questionLabel.set(String(item.id), item.text);
    questionType.set(String(item.id), item.type);
  });

  const normalizedReviews = allReviews.map((review) => {
    const rawAnswers = review.all_answers && typeof review.all_answers === 'object'
      ? review.all_answers
      : {};

    const configuredEntries = surveyItems.map((item, index) => {
      const answerValue = rawAnswers[String(item.id)];
      const answerText = answerValue == null ? '' : String(answerValue);
      return {
        key: String(item.id),
        questionText: item.text,
        questionType: item.type,
        order: index,
        answerText,
        isAnswered: answerText.trim().length > 0,
      };
    });

    const extraEntries = Object.entries(rawAnswers)
      .filter(([key]) => !questionOrder.has(key))
      .map(([key, value]) => {
        const answerText = value == null ? '' : String(value);
        return {
          key,
          questionText: questionLabel.get(key) || `質問 ${key}`,
          questionType: questionType.get(key) || 'unknown',
          order: Number.MAX_SAFE_INTEGER,
          answerText,
          isAnswered: answerText.trim().length > 0,
        };
      });

    const answerEntries = [...configuredEntries, ...extraEntries].sort((a, b) => a.order - b.order);

    const answeredEntries = answerEntries.filter((item) => item.isAnswered);
    const freeAnswerCount = answeredEntries.filter((item) => item.questionType === 'free').length;

    return {
      ...review,
      answerEntries,
      answerCount: answeredEntries.length,
      questionCount: answerEntries.length,
      freeAnswerCount,
    };
  });

  const filteredReviews = normalizedReviews
    .filter((review) => {
      if (ratingFilter !== 'all') {
        return review.rating === Number(ratingFilter);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'ratingDesc') return b.rating - a.rating;
      if (sortBy === 'ratingAsc') return a.rating - b.rating;
      if (sortBy === 'dateAsc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'answersDesc') {
        if (b.answerCount !== a.answerCount) return b.answerCount - a.answerCount;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const monthlyBucket = new Map<string, number>();
  allReviews.forEach((review) => {
    const date = new Date(review.created_at);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyBucket.set(key, (monthlyBucket.get(key) || 0) + 1);
  });

  const monthKeys = Array.from(monthlyBucket.keys()).sort((a, b) => a.localeCompare(b));
  const maxVisibleMonths = 6;
  const minVisibleMonths = 3;
  const windowSize = Math.max(minVisibleMonths, Math.min(maxVisibleMonths, monthKeys.length || 1));

  const latestMonthDate = (() => {
    const latestKey = monthKeys[monthKeys.length - 1];
    if (!latestKey) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const [year, month] = latestKey.split('-').map(Number);
    return new Date(year, month - 1, 1);
  })();

  const monthlyData = Array.from({ length: windowSize }).map((_, idx) => {
    const date = new Date(latestMonthDate);
    date.setMonth(latestMonthDate.getMonth() - (windowSize - 1 - idx));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return {
      month: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`,
      count: monthlyBucket.get(key) || 0,
    };
  });

  const monthlyMax = monthlyData.length > 0
    ? Math.max(...monthlyData.map((item) => item.count), 1)
    : 1;

  if (authChecking || customerActive === null) return <LoadingSpinner />;

  if (loading) return <LoadingSpinner />;

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
    <div className="min-h-screen font-sans selection:bg-[var(--theme-primary)] text-[var(--theme-text)] pb-32 md:pb-20">
      <div className="max-w-7xl mx-auto p-6 md:p-12">
        
        {/* ヘッダー */}
        <header className="flex justify-between items-center mb-12">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <Link href={`/main?customerId=${encodeURIComponent(customerId)}`} className="flex items-center gap-2 group">
              <span className="text-2xl group-hover:-translate-x-1 transition-transform">←</span>
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter italic leading-none uppercase">Analytics</h1>
            </Link>
            <p className="text-[10px] md:text-xs font-black uppercase tracking-widest mt-2 italic text-[var(--theme-primary)]">集計レポート</p>
          </div>
        </header>

        {/* 統計サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] shadow-[8px_8px_0px_var(--theme-border)]">
            <p className="text-[10px] font-black text-[var(--theme-text)] opacity-60 uppercase italic mb-2">総回答数</p>
            <div className="flex items-baseline gap-2 text-7xl font-black italic tracking-tighter">{totalCount}</div>
          </div>
          <div className="border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] shadow-[8px_8px_0px_var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)]">
            <p className="text-[10px] font-black opacity-60 uppercase italic mb-2">平均満足度</p>
            <div className="flex items-baseline gap-2 text-7xl font-black italic tracking-tighter">{avgRating}<span className="text-2xl">/5.0</span></div>
          </div>
          <div className="bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] shadow-[8px_8px_0px_var(--theme-primary)]">
            <p className="text-[10px] font-black text-[var(--theme-text)] opacity-60 uppercase italic mb-2">口コミ投稿率</p>
            <div className="flex items-baseline gap-2 text-7xl font-black italic tracking-tighter">{reviewPostRate}<span className="text-2xl text-[var(--theme-primary)]">%</span></div>
            <p className="text-[10px] font-black text-[var(--theme-text)]/60 mt-2">{reviewClickCount} / {startedCount}</p>
            <div className="mt-3">
              <select
                value={selectedFunnelMonth}
                onChange={(e) => setSelectedFunnelMonth(e.target.value)}
                className="px-3 py-2 rounded-xl border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[11px] font-black"
              >
                <option value="all">全期間</option>
                {availableFunnelMonths.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>{monthKey}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* グラフセクション */}
        <section className="mb-16 bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] p-8 md:p-12 rounded-[4rem] shadow-[12px_12px_0px_var(--theme-border)]">
          <div className="flex items-end justify-between mb-10">
            <h3 className="text-sm font-black uppercase tracking-widest italic border-b-4 border-[var(--theme-primary)] inline-block">月別回答数の推移</h3>
            <p className="text-[11px] font-black text-[var(--theme-text)]/70">MAX: {monthlyMax}件</p>
          </div>
          <div className="h-48 md:h-64 flex items-end justify-between gap-2 md:gap-8">
            {(monthlyData.length > 0 ? monthlyData : [{ month: 'データなし', count: 0 }]).map((data, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                <div 
                  className={`w-full rounded-t-xl border-t-2 border-x-2 border-[var(--theme-border)] transition-all duration-700`}
                  style={{ 
                    height: `${Math.max(4, (data.count / monthlyMax) * 100)}%`,
                    backgroundColor: i === (monthlyData.length > 0 ? monthlyData.length - 1 : 0) ? 'var(--theme-primary)' : 'var(--theme-text)',
                    opacity: i === (monthlyData.length > 0 ? monthlyData.length - 1 : 0) ? 1 : 0.12
                  }}
                ></div>
                <span className="text-[10px] font-black text-[var(--theme-text)] opacity-60 italic uppercase">{data.month}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 一覧セクション */}
        <section>
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-10 gap-8">
            <div className="w-full xl:w-auto">
              <h3 className="text-xl font-black italic uppercase tracking-tighter border-b-4 border-[var(--theme-primary)] inline-block mb-6">回答一覧フィード</h3>
              <div className="flex flex-col md:flex-row gap-3">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[12px] font-black"
                >
                  <option value="dateDesc">新しい順</option>
                  <option value="dateAsc">古い順</option>
                  <option value="ratingDesc">評価が高い順</option>
                  <option value="ratingAsc">評価が低い順</option>
                  <option value="answersDesc">回答項目が多い順</option>
                </select>

                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
                  className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[12px] font-black"
                >
                  <option value="all">全評価</option>
                  <option value="5">星5</option>
                  <option value="4">星4</option>
                  <option value="3">星3</option>
                  <option value="2">星2</option>
                  <option value="1">星1</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredReviews.map((review) => (
              <div key={review.id} className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] shadow-[8px_8px_0px_var(--theme-border)] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-[10px] font-black text-[var(--theme-text)] opacity-60 italic block mb-1">{new Date(review.created_at).toLocaleDateString('ja-JP')}</span>
                      <span className="px-3 py-1 rounded-full text-[9px] font-black border border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)]">
                        {review.category || "一般回答"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="flex gap-0.5 mb-1">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className="text-lg" style={{ color: i < review.rating ? 'var(--theme-primary)' : '#f3f4f6' }}>★</span>
                        ))}
                      </div>
                      <span className="text-2xl font-black italic">{review.rating}.0</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-black text-[var(--theme-text)]/60 uppercase">最終コメント（AI/自由入力）</p>
                      <p className="text-sm font-black text-[var(--theme-text)] opacity-80 leading-relaxed italic border-l-4 border-[var(--theme-text)]/10 pl-4">「{review.comment || "（コメントなし）"}」</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-black text-[var(--theme-text)]/70">
                      <p>回答項目数: {review.answerCount}/{review.questionCount}</p>
                      <p>自由記述件数: {review.freeAnswerCount}</p>
                    </div>
                  </div>

                  {review.answerEntries.length > 0 ? (
                    <div className="mt-4 pt-4 border-t border-dashed border-gray-200 space-y-2">
                      {review.answerEntries.map((item) => (
                        <div key={`${review.id}-${item.key}`} className="bg-[var(--theme-text)]/5 px-3 py-2 rounded-xl border border-[var(--theme-border)]/10">
                          <p className="text-[9px] font-black text-[var(--theme-text)]/60 mb-1">{item.questionText}</p>
                          {item.questionType === 'rating' ? (
                            item.isAnswered && !Number.isNaN(Number(item.answerText)) ? (
                              <div className="flex items-center gap-2">
                                <p className="text-[12px] font-black">
                                  {'★'.repeat(Math.max(0, Math.min(5, Number(item.answerText))))}
                                  {'☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, Number(item.answerText)))))}
                                </p>
                                <p className="text-[11px] font-black text-[var(--theme-text)]/70">{Number(item.answerText)}/5</p>
                              </div>
                            ) : (
                              <p className="text-[12px] font-black text-[var(--theme-text)]/60">未回答</p>
                            )
                          ) : item.isAnswered ? (
                            <p className="text-[12px] font-black">{item.answerText}</p>
                          ) : (
                            <p className="text-[12px] font-black text-[var(--theme-text)]/60">未回答</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
                      <p className="text-[11px] font-black text-[var(--theme-text)]/60">詳細回答データはありません。</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <nav className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-black/75 backdrop-blur-xl rounded-[3rem] h-24 flex justify-around items-center px-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] z-50 border border-white/10 ring-1 ring-white/5">
        <Link href={`/main?customerId=${encodeURIComponent(customerId)}`} className="flex flex-col items-center opacity-30 hover:opacity-100 transition-all group">
          <span className="text-white text-2xl">●</span>
          <span className="text-white text-[8px] font-black uppercase italic tracking-widest mt-1">Home</span>
        </Link>
        <Link href={`/reports?customerId=${encodeURIComponent(customerId)}`} className="flex flex-col items-center group">
          <span className="text-[var(--theme-primary)] text-2xl">●</span>
          <span className="text-[var(--theme-primary)] text-[8px] font-black uppercase italic tracking-widest mt-1">Report</span>
        </Link>
        <Link href={`/settings?customerId=${encodeURIComponent(customerId)}`} className="flex flex-col items-center opacity-30 hover:opacity-100 transition-all group">
          <span className="text-white text-2xl italic font-serif group-active:rotate-12 transition-transform">⚙</span>
          <span className="text-white text-[8px] font-black uppercase italic tracking-widest mt-1">Setting</span>
        </Link>
      </nav>
    </div>
  );
}