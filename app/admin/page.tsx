"use client";

import React, { useState, useEffect, useRef } from 'react'; // useEffectを追加
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import LoadingSpinner from '../components/LoadingSpinner';
import NoticeToast from '../components/NoticeToast';
import { useNotice } from '../components/useNotice';

type SurveyRecord = {
  rating: number;
  comment?: string | null;
  created_at: string;
  all_answers?: Record<string, string | number>;
};

type SettingsSurveyItem = {
  id: number | string;
  text?: string;
  type?: string;
};

export default function OwnerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeCustomerId = searchParams.get('customerId') || searchParams.get('customer') || '';
  const [customerId, setCustomerId] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isShareModalClosing, setIsShareModalClosing] = useState(false);
  const shareModalCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // --- DB連動の状態管理 ---
  const [stats, setStats] = useState({
    rating: 0.0,
    totalReviews: 0,
    newReviewsThisWeek: 0,
    surveyCount: 0,
    starsDistribution: [0, 0, 0, 0, 0] // 星5〜1の割合
  });
  const [latestFeedback, setLatestFeedback] = useState<SurveyRecord | null>(null);
  const [latestFeedbackQa, setLatestFeedbackQa] = useState<{ question: string; answer: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerActive, setCustomerActive] = useState<boolean | null>(null);
  const [adminGoogleMapUrl, setAdminGoogleMapUrl] = useState('https://business.google.com/');
  const [qrColorHex, setQrColorHex] = useState('000000');
  const [isDownloadingQr, setIsDownloadingQr] = useState(false);
  const { notice, showNotice, clearNotice } = useNotice();

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

  // --- データ取得ロジック ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parseColorToHex = (value: string) => {
      const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
      if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
          return hex.split('').map((ch) => ch + ch).join('').toUpperCase();
        }
        return hex.toUpperCase();
      }

      const rgbMatch = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        const [r, g, b] = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
        if ([r, g, b].every((channel) => Number.isFinite(channel))) {
          return [r, g, b]
            .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
        }
      }

      return '000000';
    };

    const rootElement = document.getElementById('theme-provider-root') || document.documentElement;
    const computed = getComputedStyle(rootElement)
      .getPropertyValue('--theme-primary')
      .trim();

    setQrColorHex(computed ? parseColorToHex(computed) : '000000');
  }, [showShareModal, customerId]);

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
        const [response, settingsResponse] = await Promise.all([
          fetch(`/api/surveys-get?customerId=${encodeURIComponent(customerId)}`),
          fetch(`/api/settings?customerId=${encodeURIComponent(customerId)}`),
        ]);
        const data = await response.json();
        const settingsData = await settingsResponse.json();
        setAdminGoogleMapUrl(String(settingsData?.settings?.adminGoogleMapUrl || 'https://business.google.com/'));
        const configuredItems: SettingsSurveyItem[] = Array.isArray(settingsData?.surveyItems) ? settingsData.surveyItems : [];
        const questionById = new Map<string, { text: string; type: string }>();
        configuredItems.forEach((item) => {
          questionById.set(String(item.id), { text: String(item.text || `質問 ${item.id}`), type: String(item.type || 'free') });
        });
        
        if (Array.isArray(data) && data.length > 0) {
          const surveys = data as SurveyRecord[];
          const total = surveys.length;
          const sum = surveys.reduce((acc, curr) => acc + curr.rating, 0);
          const avg = (sum / total).toFixed(1);

          // 今週の新規件数
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          const newThisWeek = surveys.filter((r) => new Date(r.created_at) > oneWeekAgo).length;

          // 星の分布計算
          const dist = [5, 4, 3, 2, 1].map(star => {
            const count = surveys.filter((r) => r.rating === star).length;
            return total > 0 ? (count / total) * 100 : 0;
          });

          setStats({
            rating: parseFloat(avg),
            totalReviews: total,
            newReviewsThisWeek: newThisWeek,
            surveyCount: total,
            starsDistribution: dist
          });

          // 最新のコメントがある回答を1件取得
          const latest = surveys.find((r) => r.comment) || surveys[0];
          setLatestFeedback(latest);

          const answers = latest?.all_answers && typeof latest.all_answers === 'object' ? latest.all_answers : {};
          const qaPairs = Object.entries(answers)
            .map(([key, value]) => {
              const meta = questionById.get(String(key));
              const question = meta?.text || `質問 ${key}`;
              const answerRaw = String(value ?? '').trim();
              if (!answerRaw) return null;

              if (meta?.type === 'rating' && !Number.isNaN(Number(answerRaw))) {
                const rating = Math.max(0, Math.min(5, Number(answerRaw)));
                const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
                return { question, answer: `${stars} (${rating}/5)` };
              }

              return { question, answer: answerRaw };
            })
            .filter((item): item is { question: string; answer: string } => Boolean(item));

          if (qaPairs.length > 0) {
            const randomIndex = Math.floor(Math.random() * qaPairs.length);
            setLatestFeedbackQa(qaPairs[randomIndex]);
          } else {
            setLatestFeedbackQa(null);
          }
        } else {
          setLatestFeedback(null);
          setLatestFeedbackQa(null);
        }
      } catch (error) {
        console.error("データ取得失敗:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [customerId, authChecking, customerActive]);

  const copyToClipboard = () => {
    const surveyUrl = `${window.location.origin}/survey?customerId=${encodeURIComponent(customerId)}`;
    navigator.clipboard.writeText(surveyUrl);
    showNotice('お客様用アンケートURLをコピーしました！');
  };

  const surveyUrl = customerId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/survey?customerId=${encodeURIComponent(customerId)}`
    : '';
  const qrImageUrl = surveyUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=640x640&color=${qrColorHex}&bgcolor=ffffff&data=${encodeURIComponent(surveyUrl)}`
    : '';

  const downloadQrImage = async () => {
    if (!qrImageUrl || isDownloadingQr) {
      return;
    }

    setIsDownloadingQr(true);
    try {
      const response = await fetch(qrImageUrl);
      if (!response.ok) {
        throw new Error('QR画像の取得に失敗しました');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `survey-qr-${customerId || 'default'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      showNotice('QRコード画像を保存しました');
    } catch {
      showNotice('QRコード画像の保存に失敗しました', 'error');
    } finally {
      setIsDownloadingQr(false);
    }
  };

  const openShareModal = () => {
    if (shareModalCloseTimerRef.current) {
      clearTimeout(shareModalCloseTimerRef.current);
      shareModalCloseTimerRef.current = null;
    }
    setIsShareModalClosing(false);
    setShowShareModal(true);
  };

  const closeShareModal = () => {
    if (!showShareModal || isShareModalClosing) {
      return;
    }
    setIsShareModalClosing(true);
    shareModalCloseTimerRef.current = setTimeout(() => {
      setShowShareModal(false);
      setIsShareModalClosing(false);
      shareModalCloseTimerRef.current = null;
    }, 420);
  };

  useEffect(() => {
    return () => {
      if (shareModalCloseTimerRef.current) {
        clearTimeout(shareModalCloseTimerRef.current);
      }
    };
  }, []);

  if (authChecking || loading || customerActive === null) {
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
      
      {/* --- QR共有モーダル --- */}
      {showShareModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12">
          <div 
            className={`absolute inset-0 bg-black/40 backdrop-blur-2xl ${isShareModalClosing ? 'qr-modal-backdrop-exit' : 'qr-modal-backdrop-enter'}`}
            onClick={closeShareModal}
          />
          
          <div className={`relative bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] p-8 md:p-12 rounded-[3.5rem] w-full max-w-md shadow-[0_30px_100px_rgba(0,0,0,0.4)] ${isShareModalClosing ? 'qr-modal-card-exit' : 'qr-modal-card-enter'}`}>
            
            <div className="text-center mb-10">
              <h3 className="text-3xl font-black italic uppercase tracking-tighter leading-none">Share Survey</h3>
              <p className="text-[10px] font-black text-[var(--theme-text)] opacity-60 mt-2 uppercase italic tracking-[0.2em] text-center">アンケートを共有する</p>
            </div>
            
            <div className="aspect-square bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[3rem] flex items-center justify-center mb-10 p-6 shadow-[12px_12px_0px_var(--theme-primary)] mx-auto w-56 md:w-64 overflow-hidden">
              {qrImageUrl ? (
                <Image
                  src={qrImageUrl}
                  alt="アンケートQRコード"
                  width={256}
                  height={256}
                  className="w-full h-full object-contain rounded-2xl border-2 border-[var(--theme-border)]"
                />
              ) : (
                <p className="text-xs font-black text-[var(--theme-text)]/60">QR生成中...</p>
              )}
            </div>

            <div className="grid gap-5 mb-6">
              <button
                type="button"
                onClick={downloadQrImage}
                disabled={!qrImageUrl || isDownloadingQr}
                className={`bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[3px] border-[var(--theme-border)] py-5 rounded-2xl font-black text-sm italic shadow-[6px_6px_0px_var(--theme-border)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${!qrImageUrl || isDownloadingQr ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className="text-xl">📥</span> {isDownloadingQr ? '保存中...' : '画像を保存する'}
              </button>
              <button onClick={copyToClipboard} className="bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[3px] border-[var(--theme-border)] py-5 rounded-2xl font-black text-sm italic shadow-[6px_6px_0px_var(--theme-border)] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                <span className="text-xl">🔗</span> リンクをコピー
              </button>
            </div>

            <button onClick={closeShareModal} className="w-full py-2 text-[var(--theme-text)] opacity-40 font-black text-[10px] uppercase tracking-[0.4em]">Close</button>
          </div>
        </div>
      )}

      {/* --- メインコンテンツ容器 --- */}
      <div className="max-w-7xl mx-auto p-6 md:p-12 pb-44">
        
        {/* --- Header --- */}
        <header className="flex justify-between items-center mb-12 md:mb-20">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter italic leading-none">PAL-TRUST</h1>
            <p className="text-[10px] md:text-xs font-black text-[var(--theme-primary)] uppercase tracking-widest mt-2 italic">Owner Dashboard</p>
            <p className="text-[10px] font-black text-[var(--theme-text)]/40 uppercase tracking-widest mt-1">Customer: {customerId}</p>
          </div>
          <div className="text-right hidden sm:block">
             <p className="text-[10px] font-black text-[var(--theme-text)] opacity-40 italic uppercase">#001 Admin Mode</p>
             <p className="text-xs font-black text-[var(--theme-text)] italic mt-1">店舗管理センター</p>
          </div>
        </header>

        {/* --- Grid Layout --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* 左側：メイン統計 */}
          <div className="lg:col-span-8 space-y-10">
           <section className="p-10 md:p-14 rounded-[4rem] bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[3px] border-[var(--theme-border)] shadow-[12px_12px_0px_var(--theme-primary)] relative overflow-hidden animate-in zoom-in-95 duration-700">
              <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-[var(--theme-primary)]/10 rounded-full blur-[110px]" />
              
              <div className="flex flex-col md:flex-row justify-between items-start gap-8 relative z-10">
                <div>
                  <p className="text-xs font-black text-[var(--theme-text)] opacity-60 tracking-[0.2em] uppercase mb-4 italic">Total Rating</p>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-8xl md:text-[10rem] font-black tracking-tighter italic leading-none">{stats.rating.toFixed(1)}</h2>
                    <span className={`text-[var(--theme-primary)] text-3xl md:text-5xl font-black italic`}>★</span>
                  </div>
                </div>
                <div className="md:text-right bg-[var(--theme-text)]/5 p-6 rounded-[2.5rem] border border-[var(--theme-text)]/10 backdrop-blur-sm">
                  <p className="text-xs font-black text-[var(--theme-text)] opacity-60 uppercase italic mb-2 tracking-widest">Reviews Count</p>
                  <p className="text-4xl md:text-6xl font-black italic tracking-tighter leading-none">{stats.totalReviews.toLocaleString()}</p>
                  <div className="mt-4 inline-flex items-center gap-2 bg-[var(--theme-primary)] text-[var(--theme-on-primary)] px-4 py-1.5 rounded-full text-[10px] font-black italic uppercase">
                    ↑ 今週 +{stats.newReviewsThisWeek}件
                  </div>
                </div>
              </div>
              
              <div className="mt-16 space-y-4 relative z-10 max-w-2xl">
                {[5, 4, 3, 2, 1].map((star, idx) => (
                  <div key={star} className="flex items-center gap-6">
                    <span className="text-xs font-black w-4 text-[var(--theme-text)] opacity-60 italic leading-none">{star}</span>
                    <div className="h-3 flex-1 bg-[var(--theme-text)]/5 rounded-full overflow-hidden border border-[var(--theme-text)]/5">
                      <div 
                        className={`h-full rounded-full ${star >= 4 ? 'bg-[var(--theme-primary)]' : 'bg-gray-700'} transition-all duration-1000 ease-out`} 
                        style={{ width: `${stats.starsDistribution[idx]}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* 右側：ボタンと最新回答 */}
          <div className="lg:col-span-4 space-y-10">
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-6">
              {/* 1. 集計レポート */}
              <Link href={`/main/reports?customerId=${encodeURIComponent(customerId)}`} className="w-full">
                <button className="w-full h-full bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] flex flex-col lg:flex-row items-center justify-center gap-4 shadow-[8px_8px_0px_var(--theme-border)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
                  <span className="text-5xl lg:text-3xl">📊</span>
                  <span className="text-xs font-black italic uppercase">集計レポート</span>
                </button>
              </Link>

              {/* 2. アンケート画面（新設） */}
              <Link href={`/survey?customerId=${encodeURIComponent(customerId)}`} target="_blank" className="w-full">
                <button className={`w-full h-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] flex flex-col lg:flex-row items-center justify-center gap-4 shadow-[8px_8px_0px_var(--theme-border)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all`}>
                  <span className="text-5xl lg:text-3xl">📝</span>
                  <span className="text-xs font-black italic uppercase">アンケート画面</span>
                </button>
              </Link>

              {/* 3. Googleマップ */}
              <a href={adminGoogleMapUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                <button className="w-full h-full bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] flex flex-col lg:flex-row items-center justify-center gap-4 shadow-[8px_8px_0px_var(--theme-border)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
                  <span className="text-5xl lg:text-3xl">🌐</span>
                  <span className="text-xs font-black italic uppercase">Googleマップ</span>
                </button>
              </a>

              {/* 4. Palette公式LINE（修正版：アイコンとデザインを最適化） */}
              <a href="https://lin.ee/HsbRz94" target="_blank" rel="noopener noreferrer" className="w-full">
                <button className="w-full h-full bg-[#06C755] text-white border-[3px] border-[var(--theme-border)] p-8 rounded-[3rem] flex flex-col lg:flex-row items-center justify-center gap-4 shadow-[8px_8px_0px_var(--theme-border)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all">
                  {/* アイコンをカクカクの💬から、丸みのあるSVGアイコンに変更 */}
                  <svg className="w-12 h-12 lg:w-8 lg:h-8 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21.5 9.5c0-4.1-4.3-7.5-9.5-7.5S2.5 5.4 2.5 9.5c0 3.7 3.4 6.8 7.9 7.4.3.1.7.3.8.7l.3 1.8c.1.4.3.5.6.3s1.7-1.1 2.4-2.1c3.1-.4 7-3.6 7-7.6z"/>
                  </svg>
                  <span className="text-xs font-black italic uppercase tracking-wider">Palette公式LINE</span>
                </button>
              </a>
            </div>

            <section>
              <div className="flex justify-between items-end mb-6 px-2">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] italic border-b-[3px] border-[var(--theme-primary)] pb-1">Latest Feedback</h3>
                <span className="text-[10px] font-black text-[var(--theme-text)] opacity-40 italic uppercase">All {stats.surveyCount}</span>
              </div>
              <div className="bg-[var(--theme-card-bg)] rounded-[3.5rem] border-[3px] border-[var(--theme-border)] p-10 shadow-[10px_10px_0px_var(--theme-border)]">
                {latestFeedback ? (
                  <>
                    {latestFeedbackQa ? (
                      <div className="space-y-4 mb-8">
                        <div>
                          <p className="text-[10px] font-black text-[var(--theme-text)]/60 uppercase tracking-widest">Question</p>
                          <p className="text-sm font-black text-[var(--theme-text)] opacity-80 leading-relaxed">{latestFeedbackQa.question}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-[var(--theme-text)]/60 uppercase tracking-widest">Answer</p>
                          <p className="text-sm font-black text-[var(--theme-text)] opacity-80 leading-relaxed italic">{latestFeedbackQa.answer}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-black text-[var(--theme-text)] opacity-70 mb-8 leading-relaxed italic">
                        「{latestFeedback.comment || "（回答データなし）"}」
                      </p>
                    )}
                    <div className="flex justify-between items-center pt-8 border-t border-gray-100">
                       <div className="flex gap-1.5 text-xl">
                         {[...Array(5)].map((_, i) => (
                           <span key={i} className={`${i < latestFeedback.rating ? 'text-[var(--theme-primary)]' : 'text-gray-100'}`}>★</span>
                         ))}
                       </div>
                       <span className="text-3xl font-black italic leading-none">{latestFeedback.rating.toFixed(1)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs font-black text-[var(--theme-text)] opacity-40 italic text-center py-4">まだ回答がありません</p>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>

      {/* --- Floating Bottom Nav --- */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-black/75 backdrop-blur-xl rounded-[3rem] h-24 flex justify-around items-center px-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] z-50 border border-white/10 ring-1 ring-white/5">
        <div className="flex flex-col items-center group cursor-default" aria-disabled="true">
          <span className="text-[var(--theme-primary)] text-2xl">●</span>
          <span className="text-[var(--theme-primary)] text-[8px] font-black uppercase italic tracking-widest mt-1">Home</span>
        </div>
        <button onClick={openShareModal} className="relative group outline-none">
          <div className={`bg-[var(--theme-primary)] text-[var(--theme-on-primary)] w-20 h-20 border-[3px] border-[var(--theme-border)] rounded-[2.5rem] flex items-center justify-center font-black text-4xl -mt-20 shadow-[0_15px_30px_rgba(0,0,0,0.2)] active:translate-y-1 active:shadow-none transition-all`}>
            ＋
          </div>
        </button>
        <Link href={`/main/settings?customerId=${encodeURIComponent(customerId)}`} className="flex flex-col items-center opacity-30 hover:opacity-100 transition-all group">
          <span className="text-white text-2xl italic font-serif group-active:rotate-12 transition-transform">⚙</span>
          <span className="text-white text-[8px] font-black uppercase italic tracking-widest mt-1">Setting</span>
        </Link>
      </nav>

    </div>
  );
}