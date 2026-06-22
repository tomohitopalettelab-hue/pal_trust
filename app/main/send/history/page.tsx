"use client";

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type HistoryItem = {
  id: number;
  channel: string;
  recipient: string;
  sentAt: string;
};

type ChannelFilter = 'all' | 'sms' | 'email' | 'line';

const channelLabel: Record<string, string> = {
  sms: 'SMS',
  email: 'メール',
  line: 'LINE',
};

const channelColor: Record<string, string> = {
  sms: '#3B82F6',
  email: '#10B981',
  line: '#06C755',
};

export default function SendHistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" />}>
      <SendHistoryContent />
    </Suspense>
  );
}

function SendHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || '';

  const [authChecking, setAuthChecking] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ChannelFilter>('all');

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
    setLoading(true);
    const params = new URLSearchParams({ customerId });
    if (filter !== 'all') params.set('channel', filter);
    fetch(`/api/send-history?${params}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authChecking, customerId, filter]);

  if (authChecking) return null;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const maskRecipient = (r: string) => {
    if (r === 'broadcast') return 'LINE全員';
    if (r.includes('@')) {
      const [local, domain] = r.split('@');
      return local.slice(0, 3) + '***@' + domain;
    }
    if (r.startsWith('+') || /^\d/.test(r)) {
      return r.slice(0, 6) + '****' + r.slice(-2);
    }
    return r.slice(0, 8) + '...';
  };

  const filters: { key: ChannelFilter; label: string }[] = [
    { key: 'all', label: '全て' },
    { key: 'sms', label: 'SMS' },
    { key: 'email', label: 'メール' },
    { key: 'line', label: 'LINE' },
  ];

  // 日付ごとにグループ化
  const grouped = history.reduce<Record<string, HistoryItem[]>>((acc, item) => {
    const date = new Date(item.sentAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      <div className="max-w-2xl mx-auto p-6 md:p-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black t-italic tracking-tighter">送信履歴</h1>
            <p className="text-[10px] font-black text-[var(--theme-text)]/40 uppercase tracking-widest mt-1">Send History</p>
          </div>
          <Link
            href={`/main/send?customerId=${encodeURIComponent(customerId)}`}
            className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] text-xs font-black"
          >
            ← 送信画面
          </Link>
        </div>

        {/* フィルタ */}
        <div className="flex gap-2 mb-6">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl border-[length:var(--theme-bw)] text-xs font-black transition-all ${
                filter === f.key
                  ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 shadow-[var(--theme-shadow-sm)]'
                  : 'border-[var(--theme-border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 履歴一覧 */}
        <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)]">
          {loading ? (
            <p className="text-sm text-center py-8 text-[var(--theme-text)]/50">読み込み中...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-center py-8 text-[var(--theme-text)]/50">送信履歴がありません</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <h3 className="text-[10px] font-black text-[var(--theme-text)]/40 uppercase mb-3">{date}</h3>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-xl border-2 border-[var(--theme-border)]"
                      >
                        <span
                          className="px-2 py-0.5 rounded-lg text-[9px] font-black text-white shrink-0"
                          style={{ backgroundColor: channelColor[item.channel] || '#888' }}
                        >
                          {channelLabel[item.channel] || item.channel}
                        </span>
                        <span className="text-sm font-bold truncate flex-1">
                          {maskRecipient(item.recipient)}
                        </span>
                        <span className="text-[10px] text-[var(--theme-text)]/40 shrink-0">
                          {new Date(item.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <p className="text-[9px] text-[var(--theme-text)]/40 mt-4 text-center">{history.length}件表示</p>
          )}
        </section>
      </div>
    </div>
  );
}
