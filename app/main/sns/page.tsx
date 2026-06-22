"use client";

import React, { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import NoticeToast from '../../components/NoticeToast';
import { useNotice } from '../../components/useNotice';

type SurveyRecord = {
  id: number;
  rating: number;
  comment?: string | null;
  created_at: string;
  all_answers?: Record<string, string | number>;
};

type SnsFormat = {
  key: string;
  label: string;
  width: number;
  height: number;
  maxReviews: number;
};

type ColorTheme = {
  key: string;
  label: string;
  bg: string;
  cardBg: string;
  accent: string;
  text: string;
  starColor: string;
};

const SNS_FORMATS: Record<string, SnsFormat[]> = {
  instagram: [
    { key: 'ig_feed', label: 'フィード (1:1)', width: 1080, height: 1080, maxReviews: 3 },
    { key: 'ig_story', label: 'ストーリー (9:16)', width: 1080, height: 1920, maxReviews: 5 },
  ],
  tiktok: [
    { key: 'tt_post', label: '投稿 (9:16)', width: 1080, height: 1920, maxReviews: 5 },
  ],
  line: [
    { key: 'line_voom', label: 'VOOM (1:1)', width: 1080, height: 1080, maxReviews: 3 },
  ],
  x: [
    { key: 'x_post', label: 'ポスト (16:9)', width: 1200, height: 675, maxReviews: 2 },
  ],
};

const COLOR_THEMES: ColorTheme[] = [
  { key: 'warm', label: 'ウォーム', bg: '#FFF8E7', cardBg: '#FFFFFF', accent: '#F9C11C', text: '#333333', starColor: '#F9C11C' },
  { key: 'cool', label: 'クール', bg: '#EEF2FF', cardBg: '#FFFFFF', accent: '#3B82F6', text: '#1E293B', starColor: '#3B82F6' },
  { key: 'elegant', label: 'エレガント', bg: '#1A1A2E', cardBg: '#16213E', accent: '#D4AF37', text: '#F5F5F5', starColor: '#D4AF37' },
  { key: 'natural', label: 'ナチュラル', bg: '#F0F7F0', cardBg: '#FFFFFF', accent: '#2ECC71', text: '#2D3436', starColor: '#2ECC71' },
  { key: 'pop', label: 'ポップ', bg: '#FFF0F5', cardBg: '#FFFFFF', accent: '#FF69B4', text: '#333333', starColor: '#FF69B4' },
];

const SNS_LIST = [
  { key: 'instagram', label: 'Instagram', icon: '📷' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵' },
  { key: 'line', label: 'LINE', icon: '💬' },
  { key: 'x', label: 'X', icon: '𝕏' },
];

export default function SnsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" />}>
      <SnsContent />
    </Suspense>
  );
}

function SnsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || '';
  const { notice, showNotice, clearNotice } = useNotice();

  const [authChecking, setAuthChecking] = useState(true);
  const [reviews, setReviews] = useState<SurveyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // 選択状態
  const [selectedSns, setSelectedSns] = useState('instagram');
  const [selectedFormat, setSelectedFormat] = useState('ig_feed');
  const [selectedReviewIds, setSelectedReviewIds] = useState<number[]>([]);
  const [colorTheme, setColorTheme] = useState('warm');
  const [headerTitle, setHeaderTitle] = useState('お客様の声');

  const previewRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // カードごとの位置オフセット（自由配置用）
  const [cardPositions, setCardPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [draggingCard, setDraggingCard] = useState<{ id: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  // スナップガイド線
  const [snapGuides, setSnapGuides] = useState<{ horizontal: number | null; vertical: number | null }>({ horizontal: null, vertical: null });

  useEffect(() => {
    const loggedIn = localStorage.getItem('customerLoggedIn') === 'true';
    if (!loggedIn || !customerId) {
      router.replace('/main/login');
      return;
    }
    setAuthChecking(false);
  }, [router, customerId]);

  useEffect(() => {
    if (authChecking || !customerId) return;
    fetch(`/api/surveys-get?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setReviews(data.filter((r: SurveyRecord) => r.comment?.trim()));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authChecking, customerId]);

  // プレビューのスケール計算
  const currentFormats = SNS_FORMATS[selectedSns] || [];
  const currentFormat = currentFormats.find((f) => f.key === selectedFormat) || currentFormats[0];
  const previewScale = currentFormat ? Math.min(1, 380 / currentFormat.width) : 0.5;

  // プレビュー内カードの自由配置ドラッグ（pointer events + スナップ）
  const SNAP_THRESHOLD = 12; // スナップ距離（px）
  useEffect(() => {
    if (!draggingCard) return;
    const scale = previewScale;
    const onMove = (e: PointerEvent) => {
      let dx = (e.clientX - draggingCard.startX) / scale;
      let dy = (e.clientY - draggingCard.startY) / scale;
      let newX = draggingCard.origX + dx;
      let newY = draggingCard.origY + dy;

      // スナップ判定（0 = 元の位置 = 中央寄せの場合の中央）
      let hGuide: number | null = null;
      let vGuide: number | null = null;

      // X軸: 0にスナップ（水平中央）
      if (Math.abs(newX) < SNAP_THRESHOLD) {
        newX = 0;
        vGuide = 0.5; // 垂直中央線
      }

      // Y軸: 0にスナップ（元の位置）
      if (Math.abs(newY) < SNAP_THRESHOLD) {
        newY = 0;
        hGuide = 0.5; // 水平中央線
      }

      setCardPositions((prev) => ({
        ...prev,
        [draggingCard.id]: { x: newX, y: newY },
      }));
      setSnapGuides({ horizontal: hGuide, vertical: vGuide });
    };
    const onUp = () => {
      setDraggingCard(null);
      setSnapGuides({ horizontal: null, vertical: null });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingCard, previewScale]);

  if (authChecking) return null;

  const theme = COLOR_THEMES.find((t) => t.key === colorTheme) || COLOR_THEMES[0];
  const selectedReviews = reviews.filter((r) => selectedReviewIds.includes(r.id));

  const handleSnsChange = (sns: string) => {
    setSelectedSns(sns);
    const formats = SNS_FORMATS[sns] || [];
    setSelectedFormat(formats[0]?.key || '');
  };

  const toggleReview = (id: number) => {
    if (selectedReviewIds.includes(id)) {
      setSelectedReviewIds((prev) => prev.filter((rid) => rid !== id));
    } else if (currentFormat && selectedReviewIds.length < currentFormat.maxReviews) {
      setSelectedReviewIds((prev) => [...prev, id]);
    } else {
      showNotice(`最大${currentFormat?.maxReviews}件まで選択できます`, 'error');
    }
  };

  // ドラッグで並び替え
  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    setSelectedReviewIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragIdx(targetIdx);
  };

  const handleCardPointerDown = (e: React.PointerEvent, id: number) => {
    e.preventDefault();
    const pos = cardPositions[id] || { x: 0, y: 0 };
    setDraggingCard({ id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  };

  // Canvas 2D APIで直接画像を描画
  const renderToCanvas = (): HTMLCanvasElement => {
    const w = currentFormat?.width || 1080;
    const h = currentFormat?.height || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const pad = 60;
    const count = selectedReviews.length || 1;

    // 背景
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    // タイトル
    const titleSize = count <= 1 ? 48 : count <= 2 ? 42 : count <= 3 ? 36 : 30;
    ctx.fillStyle = theme.text;
    ctx.font = `900 ${titleSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(headerTitle, w / 2, pad + titleSize);

    const titleAreaHeight = pad + titleSize + 30;
    const cardAreaHeight = h - titleAreaHeight - pad;

    // 口コミカード描画
    const cardGap = count <= 1 ? 0 : count <= 2 ? 24 : count <= 3 ? 16 : 12;
    const totalGap = (count - 1) * cardGap;
    const cardH = count <= 2
      ? Math.min(cardAreaHeight * 0.6, 300)
      : (cardAreaHeight - totalGap) / count;
    const cardW = w - pad * 2;
    const starFontSize = count <= 1 ? 36 : count <= 2 ? 28 : count <= 3 ? 24 : 20;
    const textFontSize = count <= 1 ? 26 : count <= 2 ? 22 : count <= 3 ? 18 : count <= 4 ? 16 : 14;
    const cardPad = count <= 1 ? 40 : count <= 2 ? 32 : count <= 3 ? 24 : 18;
    const radius = count <= 2 ? 28 : 18;

    // 中央寄せオフセット
    const totalCardHeight = count * cardH + totalGap;
    let startY = count <= 2
      ? titleAreaHeight + (cardAreaHeight - totalCardHeight) / 2
      : titleAreaHeight;

    selectedReviews.forEach((r, i) => {
      const pos = cardPositions[r.id] || { x: 0, y: 0 };
      const cx = pad + pos.x;
      const cy = startY + i * (cardH + cardGap) + pos.y;

      // カード背景（角丸）
      ctx.fillStyle = theme.cardBg;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cardW, cardH, radius);
      ctx.fill();
      // 影
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 星
      ctx.font = `${starFontSize}px sans-serif`;
      ctx.textAlign = 'left';
      let starX = cx + cardPad;
      const starY = cy + cardPad + starFontSize;
      for (let s = 1; s <= 5; s++) {
        ctx.fillStyle = s <= r.rating ? theme.starColor : '#E0E0E0';
        ctx.fillText('★', starX, starY);
        starX += starFontSize * 1.1;
      }

      // コメント（折り返し）
      ctx.fillStyle = theme.text;
      ctx.font = `${count <= 2 ? 500 : 400} ${textFontSize}px sans-serif`;
      const textX = cx + cardPad;
      let textY = starY + starFontSize * 0.8;
      const maxW = cardW - cardPad * 2;
      const lineH = textFontSize * 1.7;
      const comment = r.comment || '';
      // 手動折り返し
      let line = '';
      for (const ch of comment) {
        const testLine = line + ch;
        if (ctx.measureText(testLine).width > maxW) {
          ctx.fillText(line, textX, textY);
          line = ch;
          textY += lineH;
          if (textY > cy + cardH - cardPad) break;
        } else {
          line = testLine;
        }
      }
      if (textY <= cy + cardH - cardPad) {
        ctx.fillText(line, textX, textY);
      }
    });

    return canvas;
  };

  const handleSave = () => {
    if (selectedReviews.length === 0) {
      showNotice('口コミを選択してください', 'error');
      return;
    }
    try {
      const canvas = renderToCanvas();
      const link = document.createElement('a');
      link.download = `review-${selectedSns}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showNotice('画像を保存しました', 'success');
    } catch {
      showNotice('画像の保存に失敗しました', 'error');
    }
  };

  const handleShare = async () => {
    if (selectedReviews.length === 0) {
      showNotice('口コミを選択してください', 'error');
      return;
    }
    try {
      const canvas = renderToCanvas();
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      const file = new File([blob], 'review.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: headerTitle });
        showNotice('共有しました', 'success');
      } else {
        handleSave();
      }
    } catch {
      handleSave();
    }
  };

  const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);



  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      {notice && <NoticeToast message={notice.message} variant={notice.variant} onClose={clearNotice} />}

      <div className="max-w-5xl mx-auto p-6 md:p-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black t-italic tracking-tighter">SNS投稿</h1>
            <p className="text-[10px] font-black text-[var(--theme-text)]/40 uppercase tracking-widest mt-1">Review to SNS</p>
          </div>
          <Link
            href={`/main?customerId=${encodeURIComponent(customerId)}`}
            className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] text-xs font-black"
          >
            ← 戻る
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左: 設定パネル */}
          <div className="space-y-6">
            {/* SNS選択 */}
            <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)]">
              <h2 className="text-sm font-black t-italic uppercase mb-4">投稿先SNS</h2>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {SNS_LIST.map((sns) => (
                  <button
                    key={sns.key}
                    onClick={() => handleSnsChange(sns.key)}
                    className={`p-3 rounded-xl border-[length:var(--theme-bw)] font-black text-xs text-center transition-all ${
                      selectedSns === sns.key
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10'
                        : 'border-[var(--theme-border)]'
                    }`}
                  >
                    <div className="text-2xl mb-1">{sns.icon}</div>
                    {sns.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {currentFormats.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setSelectedFormat(f.key)}
                    className={`flex-1 py-2 rounded-lg border-2 text-[10px] font-black transition-all ${
                      selectedFormat === f.key
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10'
                        : 'border-[var(--theme-border)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </section>

            {/* カラーテーマ */}
            <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)]">
              <h2 className="text-sm font-black t-italic uppercase mb-4">デザイン設定</h2>
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">タイトル</label>
              <input
                type="text"
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-2 text-sm mb-4"
              />
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">カラーテーマ</label>
              <div className="flex gap-2">
                {COLOR_THEMES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setColorTheme(t.key)}
                    className={`flex-1 py-2 rounded-xl border-[length:var(--theme-bw)] text-[10px] font-black transition-all ${
                      colorTheme === t.key ? 'border-[var(--theme-primary)] shadow-[var(--theme-shadow-sm)]' : 'border-[var(--theme-border)]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full mx-auto mb-1 border" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.bg})` }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            {/* 口コミ選択 */}
            <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black t-italic uppercase">口コミを選択</h2>
                <span className="text-[10px] font-black text-[var(--theme-text)]/50">
                  {selectedReviewIds.length}/{currentFormat?.maxReviews || 0}件選択
                </span>
              </div>

              {/* 選択済み口コミの並び替え */}
              {selectedReviewIds.length > 1 && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--theme-bg)] border-2 border-[var(--theme-border)]">
                  <p className="text-[9px] font-black text-[var(--theme-text)]/40 mb-2 uppercase">表示順（ドラッグで並び替え）</p>
                  <div className="space-y-1">
                    {selectedReviewIds.map((id, idx) => {
                      const rev = reviews.find((r) => r.id === id);
                      if (!rev) return null;
                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={() => setDragIdx(idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragEnd={() => setDragIdx(null)}
                          className={`flex items-center gap-2 p-2 rounded-lg border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] cursor-grab text-[10px] ${dragIdx === idx ? 'opacity-40' : ''}`}
                        >
                          <span className="text-[var(--theme-text)]/30 font-black">{idx + 1}</span>
                          <span className="text-yellow-500">{stars(rev.rating)}</span>
                          <span className="truncate flex-1">{rev.comment?.slice(0, 30)}...</span>
                          <span className="text-[var(--theme-text)]/20">⠿</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {loading ? (
                <p className="text-sm text-center py-4 text-[var(--theme-text)]/50">読み込み中...</p>
              ) : reviews.length === 0 ? (
                <p className="text-sm text-center py-4 text-[var(--theme-text)]/50">コメント付きの回答がありません</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {reviews.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => toggleReview(r.id)}
                      className={`w-full text-left p-3 rounded-xl border-[length:var(--theme-bw)] transition-all ${
                        selectedReviewIds.includes(r.id)
                          ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10'
                          : 'border-[var(--theme-border)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-500 text-xs">{stars(r.rating)}</span>
                        <span className="text-[9px] text-[var(--theme-text)]/40">
                          {new Date(r.created_at).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2">{r.comment}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 位置リセット + 保存/共有ボタン */}
            {Object.keys(cardPositions).length > 0 && (
              <button
                onClick={() => setCardPositions({})}
                className="w-full py-2 rounded-xl border-2 border-[var(--theme-border)] text-[10px] font-black text-[var(--theme-text)]/50 mb-2"
              >
                配置をリセット
              </button>
            )}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleSave}
                disabled={selectedReviews.length === 0}
                className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] py-4 rounded-2xl font-black text-sm shadow-[var(--theme-shadow-md)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40"
              >
                画像を保存
              </button>
              <button
                onClick={handleShare}
                disabled={selectedReviews.length === 0}
                className="bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[length:var(--theme-bw)] border-[var(--theme-border)] py-4 rounded-2xl font-black text-sm shadow-[var(--theme-shadow-md)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40"
              >
                SNSに共有
              </button>
            </div>
          </div>

          {/* 右: プレビュー */}
          <div className="overflow-hidden">
            <h2 className="text-sm font-black t-italic uppercase mb-4">プレビュー</h2>
            <div className="flex justify-center overflow-hidden" style={{ height: currentFormat ? currentFormat.height * previewScale + 20 : 600 }}>
              <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center' }}>
                <div
                  ref={previewRef}
                  style={{
                    width: currentFormat?.width || 1080,
                    height: currentFormat?.height || 1080,
                    backgroundColor: theme.bg,
                    padding: '60px',
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: 'sans-serif',
                    fontStyle: 'normal',
                    position: 'relative',
                  }}
                >
                  {/* スナップガイド線 */}
                  {draggingCard && snapGuides.vertical !== null && (
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: '2px',
                      backgroundColor: '#FF4081',
                      opacity: 0.8,
                      zIndex: 100,
                      pointerEvents: 'none',
                    }} />
                  )}
                  {draggingCard && snapGuides.horizontal !== null && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: 0,
                      right: 0,
                      height: '2px',
                      backgroundColor: '#FF4081',
                      opacity: 0.8,
                      zIndex: 100,
                      pointerEvents: 'none',
                    }} />
                  )}
                  {/* ヘッダー - 口コミ数に応じてサイズ調整 */}
                  {(() => {
                    const count = selectedReviews.length;
                    const titleSize = count <= 1 ? '48px' : count <= 2 ? '42px' : count <= 3 ? '36px' : '30px';
                    const headerPad = count <= 2 ? '48px' : count <= 3 ? '32px' : '20px';
                    return (
                      <div style={{ textAlign: 'center', marginBottom: headerPad }}>
                        <h2 style={{
                          fontSize: titleSize,
                          fontWeight: 900,
                          color: theme.text,
                          letterSpacing: '-0.03em',
                          fontStyle: 'normal',
                        }}>
                          {headerTitle}
                        </h2>
                      </div>
                    );
                  })()}

                  {/* 口コミカード - 数に応じてサイズ自動調整 */}
                  {(() => {
                    const count = selectedReviews.length || 1;
                    // 口コミ数に応じたサイズ設定
                    const cardPadding = count <= 1 ? '48px' : count <= 2 ? '40px' : count <= 3 ? '28px' : '20px';
                    const starSize = count <= 1 ? '40px' : count <= 2 ? '32px' : count <= 3 ? '28px' : '22px';
                    const fontSize = count <= 1 ? '28px' : count <= 2 ? '22px' : count <= 3 ? '18px' : count <= 4 ? '16px' : '14px';
                    const lineHeight = count <= 2 ? 2.0 : count <= 3 ? 1.8 : 1.6;
                    const gap = count <= 1 ? '0px' : count <= 2 ? '24px' : count <= 3 ? '16px' : '12px';
                    const borderRadius = count <= 2 ? '32px' : '20px';

                    return (
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap,
                        justifyContent: count <= 2 ? 'center' : 'flex-start',
                      }}>
                        {selectedReviews.length === 0 ? (
                          <div style={{ textAlign: 'center', color: theme.text, opacity: 0.3, fontSize: '24px' }}>
                            口コミを選択してください
                          </div>
                        ) : (
                          selectedReviews.map((r) => {
                            const pos = cardPositions[r.id] || { x: 0, y: 0 };
                            return (
                            <div
                              key={r.id}
                              onPointerDown={(e) => handleCardPointerDown(e, r.id)}
                              style={{
                                backgroundColor: theme.cardBg,
                                borderRadius,
                                padding: cardPadding,
                                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                                flex: count <= 2 ? 'none' : '1',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                cursor: draggingCard?.id === r.id ? 'grabbing' : 'grab',
                                transform: `translate(${pos.x}px, ${pos.y}px)`,
                                userSelect: 'none',
                                touchAction: 'none',
                              }}
                            >
                              <div style={{ marginBottom: count <= 2 ? '16px' : '8px' }}>
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <span
                                    key={s}
                                    style={{
                                      fontSize: starSize,
                                      color: s <= r.rating ? theme.starColor : '#E0E0E0',
                                    }}
                                  >
                                    ★
                                  </span>
                                ))}
                              </div>
                              <p style={{
                                fontSize,
                                lineHeight,
                                color: theme.text,
                                fontWeight: count <= 2 ? 500 : 400,
                                fontStyle: 'normal',
                              }}>
                                {r.comment}
                              </p>
                            </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
