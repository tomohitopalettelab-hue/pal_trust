"use client";

import React, { useEffect, useRef, useState } from 'react';

export type LotteryPrize = { id: string; name: string; probability: number };

type DrawResult = { won: boolean; prizeId: string | null; prizeName: string | null };

type Props = {
  animation: 'roulette' | 'scratch' | string;
  prizes: LotteryPrize[];
  loseMessage: string;
  customerId: string;
  isDemo: boolean;
  onComplete: () => void;
};

const LOSE_LABEL = 'はずれ';

// ルーレットのセグメント色（テーマに依存しすぎないよう固定の差し色を交互に）
const SEGMENT_COLORS = ['#F9C11C', '#FFFFFF', '#FFE082', '#FFF8E1'];

export default function Lottery({ animation, prizes, loseMessage, customerId, isDemo, onComplete }: Props) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle');
  const [result, setResult] = useState<DrawResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const drawnRef = useRef(false);

  // 表示用セグメント: 景品 + はずれ（最低1つ）。視覚的には等分。
  const segments: { label: string; isLose: boolean; prizeId: string | null }[] = [
    ...prizes.map((p) => ({ label: p.name, isLose: false, prizeId: p.id })),
    { label: LOSE_LABEL, isLose: true, prizeId: null },
  ];

  const drawAndAnimate = async () => {
    if (drawnRef.current) return;
    drawnRef.current = true;

    let res: DrawResult = { won: false, prizeId: null, prizeName: null };
    try {
      const r = await fetch('/api/lottery/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (r.ok) res = await r.json();
    } catch {
      // 失敗時ははずれ扱い
    }
    void isDemo; // デモでも同じ挙動（APIは非保存）

    if (animation === 'roulette') {
      // 当選セグメントのindexを特定
      let targetIdx = segments.findIndex((s) => s.prizeId && s.prizeId === res.prizeId);
      if (targetIdx < 0) targetIdx = segments.findIndex((s) => s.isLose);
      const segAngle = 360 / segments.length;
      // セグメント中央が真上(指針位置)に来るような回転量。複数回転を足してダイナミックに。
      const targetCenter = targetIdx * segAngle + segAngle / 2;
      const finalRotation = 360 * 6 - targetCenter; // 6周回してから着地
      setPhase('spinning');
      // 次フレームで回転開始（transitionを効かせる）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setRotation(finalRotation));
      });
      // アニメ完了後に結果表示（CSS transition 4.2s に合わせる）
      window.setTimeout(() => {
        setResult(res);
        setPhase('result');
      }, 4400);
    } else {
      // くじ（箱）: シェイク後に開封
      setPhase('spinning');
      window.setTimeout(() => {
        setResult(res);
        setPhase('result');
      }, 1500);
    }
  };

  // ルーレットは自動で抽選開始、くじはタップで開始
  useEffect(() => {
    if (animation === 'roulette') {
      const t = window.setTimeout(drawAndAnimate, 600);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-[90%] max-w-md mx-auto flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-500">
      <div>
        <p className="text-[10px] md:text-xs font-black tracking-[0.3em] uppercase text-[var(--theme-text)]/40">Lucky Draw</p>
        <h2 className="text-2xl md:text-3xl font-black t-italic mt-1">
          {phase === 'result' ? (result?.won ? '🎉 当たり！' : '残念…') : '抽選チャンス！'}
        </h2>
      </div>

      {/* ===== ルーレット ===== */}
      {animation === 'roulette' && phase !== 'result' && (
        <Roulette segments={segments} rotation={rotation} />
      )}

      {/* ===== くじ（箱） ===== */}
      {animation !== 'roulette' && phase !== 'result' && (
        <button
          onClick={drawAndAnimate}
          disabled={phase === 'spinning'}
          className={`select-none ${phase === 'spinning' ? 'lottery-box-shake pointer-events-none' : 'active:scale-95'} transition-transform`}
          aria-label="くじを引く"
        >
          <div className="w-44 h-44 md:w-52 md:h-52 rounded-[var(--theme-radius)] bg-[var(--theme-primary)] border-[length:var(--theme-bw)] border-[var(--theme-border)] shadow-[var(--theme-shadow)] flex items-center justify-center text-7xl">
            🎁
          </div>
          <p className="mt-4 text-sm font-black text-[var(--theme-text)]/70">
            {phase === 'spinning' ? '開封中…' : 'タップしてくじを引く'}
          </p>
        </button>
      )}

      {/* ===== 結果 ===== */}
      {phase === 'result' && result && (
        <div className="w-full animate-in zoom-in-95 duration-500 flex flex-col items-center gap-4">
          <div
            className={`w-full rounded-[var(--theme-radius)] border-[length:var(--theme-bw)] border-[var(--theme-border)] p-7 shadow-[var(--theme-shadow)] ${
              result.won ? 'bg-[var(--theme-primary)] text-[var(--theme-on-primary)]' : 'bg-[var(--theme-card-bg)] text-[var(--theme-text)]'
            }`}
          >
            <div className="text-5xl mb-3">{result.won ? '🎊' : '🙏'}</div>
            {result.won ? (
              <>
                <p className="text-[11px] font-black uppercase tracking-widest opacity-70 mb-1">特典</p>
                <p className="text-2xl md:text-3xl font-black t-italic leading-tight">{result.prizeName}</p>
                <p className="text-[11px] font-bold mt-4 opacity-80">この画面をスタッフにお見せください</p>
              </>
            ) : (
              <p className="text-base md:text-lg font-black leading-relaxed">{loseMessage || 'またのご参加をお待ちしております'}</p>
            )}
          </div>

          <button
            onClick={onComplete}
            className="w-full bg-[var(--theme-text)] text-[var(--theme-bg)] p-4 md:p-5 rounded-2xl font-black text-lg md:text-xl shadow-[var(--theme-shadow-accent)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            続ける
          </button>
        </div>
      )}
    </div>
  );
}

// --- ルーレット円盤（SVG） ---
function Roulette({
  segments,
  rotation,
}: {
  segments: { label: string; isLose: boolean; prizeId: string | null }[];
  rotation: number;
}) {
  const n = segments.length;
  const cx = 150;
  const cy = 150;
  const r = 142;
  const segAngle = 360 / n;

  const polar = (angleDeg: number, radius: number) => {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };

  return (
    <div className="relative w-[280px] h-[300px] md:w-[300px] md:h-[320px] flex items-start justify-center">
      {/* 指針（真上） */}
      <div
        className="absolute top-0 z-20"
        style={{ width: 0, height: 0, borderLeft: '16px solid transparent', borderRight: '16px solid transparent', borderTop: '26px solid var(--theme-border)' }}
      />
      <svg
        width="300"
        height="300"
        viewBox="0 0 300 300"
        className="mt-6"
        style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 4.2s cubic-bezier(0.17, 0.67, 0.2, 1)' }}
      >
        {segments.map((s, i) => {
          const start = i * segAngle;
          const end = start + segAngle;
          const p1 = polar(start, r);
          const p2 = polar(end, r);
          const largeArc = segAngle > 180 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
          const mid = start + segAngle / 2;
          const labelPos = polar(mid, r * 0.62);
          const fill = s.isLose ? '#E0E0E0' : SEGMENT_COLORS[i % SEGMENT_COLORS.length];
          // テキストは外向き
          return (
            <g key={i}>
              <path d={d} fill={fill} stroke="#111111" strokeWidth={3} />
              <text
                x={labelPos.x}
                y={labelPos.y}
                fill="#111111"
                fontSize={s.label.length > 6 ? 12 : 15}
                fontWeight={900}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid}, ${labelPos.x}, ${labelPos.y})`}
              >
                {s.label.length > 8 ? s.label.slice(0, 7) + '…' : s.label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={20} fill="#111111" />
        <circle cx={cx} cy={cy} r={11} fill="#F9C11C" />
      </svg>
    </div>
  );
}
