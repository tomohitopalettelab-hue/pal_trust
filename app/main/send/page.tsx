"use client";

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import NoticeToast from '../../components/NoticeToast';
import { useNotice } from '../../components/useNotice';

type LineFriend = { line_user_id: string; display_name: string };
type SendChannel = 'sms' | 'email' | 'line_broadcast' | 'line_push';

export default function SendSurveyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" />}>
      <SendSurveyContent />
    </Suspense>
  );
}

function QuotaGauge({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const remaining = Math.max(0, limit - used);
  return (
    <div className="flex-1">
      <div className="flex justify-between items-end mb-1">
        <span className="text-[10px] font-black uppercase">{label}</span>
        <span className="text-xs font-black">残り <span style={{ color }}>{remaining}</span>通</span>
      </div>
      <div className="w-full h-3 bg-[var(--theme-bg)] rounded-full border border-[var(--theme-border)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-[9px] text-[var(--theme-text)]/40 mt-1 text-right">{used}/{limit}通使用</p>
    </div>
  );
}

function SendSurveyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || '';
  const { notice, showNotice, clearNotice } = useNotice();

  const [authChecking, setAuthChecking] = useState(true);
  const [sendChannel, setSendChannel] = useState<SendChannel>('sms');
  const [sendRecipients, setSendRecipients] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lineFriends, setLineFriends] = useState<LineFriend[]>([]);
  const [selectedLineFriends, setSelectedLineFriends] = useState<string[]>([]);
  const [quotas, setQuotas] = useState<{ sms?: { used: number; limit: number }; email?: { used: number; limit: number } } | null>(null);
  const [lineQuota, setLineQuota] = useState<{ configured: boolean; used?: number; limit?: number } | null>(null);

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
    fetch(`/api/send-quota?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then(setQuotas).catch(() => {});
    fetch(`/api/line-quota?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then(setLineQuota).catch(() => {});
    fetch(`/api/line-friends?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then((d) => setLineFriends(d.friends || [])).catch(() => {});
  }, [authChecking, customerId]);

  if (authChecking) return null;

  const generateMessage = async (withTitle: boolean) => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          title: withTitle ? messageTitle : '',
          channel: sendChannel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setSendMessage(data.message);
      } else {
        showNotice(data.error || 'AI生成に失敗しました', 'error');
      }
    } catch {
      showNotice('AI生成中にエラーが発生しました', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!sendMessage.trim()) {
      setSendResult({ success: false, message: '送信内容を入力してください' });
      return;
    }
    setSendLoading(true);
    setSendResult(null);
    try {
      const recipients = sendChannel === 'line_broadcast'
        ? ['broadcast']
        : sendChannel === 'line_push'
          ? selectedLineFriends
          : sendRecipients.split('\n').map((s) => s.trim()).filter(Boolean);

      if (!recipients.length) {
        setSendResult({ success: false, message: '送信先を入力してください' });
        setSendLoading(false);
        return;
      }

      const res = await fetch('/api/send-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, channel: sendChannel, recipients, message: sendMessage }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSendResult({ success: true, message: `${data.sentCount}件送信しました！` });
        setSendRecipients('');
        setSelectedLineFriends([]);
        showNotice(`${data.sentCount}件送信しました！`, 'success');
        fetch(`/api/send-quota?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then(setQuotas).catch(() => {});
        fetch(`/api/line-quota?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then(setLineQuota).catch(() => {});
      } else {
        setSendResult({ success: false, message: data.error || '送信に失敗しました' });
      }
    } catch {
      setSendResult({ success: false, message: '送信中にエラーが発生しました' });
    } finally {
      setSendLoading(false);
    }
  };

  const channels: { key: SendChannel; label: string; icon: string }[] = [
    { key: 'sms', label: 'SMS', icon: '📱' },
    { key: 'email', label: 'メール', icon: '✉️' },
    { key: 'line_broadcast', label: 'LINE全員', icon: '💬' },
    { key: 'line_push', label: 'LINE個別', icon: '👤' },
  ];

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      {notice && <NoticeToast message={notice.message} variant={notice.variant} onClose={clearNotice} />}

      <div className="max-w-2xl mx-auto p-6 md:p-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter">アンケート送信</h1>
            <p className="text-[10px] font-black text-[var(--theme-text)]/40 uppercase tracking-widest mt-1">Send Survey</p>
          </div>
          <Link
            href={`/main?customerId=${encodeURIComponent(customerId)}`}
            className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] text-xs font-black"
          >
            ← 戻る
          </Link>
        </div>

        {/* 残送信数ゲージ */}
        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-5 shadow-[8px_8px_0px_var(--theme-border)] mb-6">
          <h2 className="text-[10px] font-black italic uppercase mb-3 text-[var(--theme-text)]/60">今月の残送信数</h2>
          <div className="flex gap-4">
            <QuotaGauge label="SMS" used={quotas?.sms?.used || 0} limit={quotas?.sms?.limit || 100} color="#3B82F6" />
            <QuotaGauge label="メール" used={quotas?.email?.used || 0} limit={quotas?.email?.limit || 3000} color="#10B981" />
            <QuotaGauge
              label="LINE"
              used={lineQuota?.configured ? (lineQuota.used || 0) : 0}
              limit={lineQuota?.configured ? (lineQuota.limit || 0) : 0}
              color="#06C755"
            />
          </div>
        </section>

        {/* チャネル選択 */}
        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] mb-6">
          <h2 className="text-sm font-black italic uppercase mb-4">送信方法を選択</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {channels.map((ch) => (
              <button
                key={ch.key}
                onClick={() => { setSendChannel(ch.key); setSendResult(null); }}
                className={`p-4 rounded-2xl border-[3px] font-black text-xs transition-all text-center ${
                  sendChannel === ch.key
                    ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 shadow-[4px_4px_0px_var(--theme-border)]'
                    : 'border-[var(--theme-border)]'
                }`}
              >
                <span className="text-2xl block mb-2">{ch.icon}</span>
                {ch.label}
              </button>
            ))}
          </div>
        </section>

        {/* 送信先 */}
        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] mb-6">
          <h2 className="text-sm font-black italic uppercase mb-4">送信先</h2>
          {sendChannel === 'sms' && (
            <textarea
              value={sendRecipients}
              onChange={(e) => setSendRecipients(e.target.value)}
              placeholder={"+8190xxxxxxxx\n+8180xxxxxxxx"}
              rows={3}
              className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
            />
          )}
          {sendChannel === 'email' && (
            <textarea
              value={sendRecipients}
              onChange={(e) => setSendRecipients(e.target.value)}
              placeholder={"test@example.com\nuser@example.com"}
              rows={3}
              className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
            />
          )}
          {sendChannel === 'line_broadcast' && (
            <p className="text-sm font-black text-center py-4">友だち全員に送信されます</p>
          )}
          {sendChannel === 'line_push' && (
            lineFriends.length ? (
              <div>
                <button
                  onClick={() => setSelectedLineFriends(
                    selectedLineFriends.length === lineFriends.length ? [] : lineFriends.map((f) => f.line_user_id)
                  )}
                  className="text-[10px] font-black text-[var(--theme-primary)] mb-2"
                >
                  {selectedLineFriends.length === lineFriends.length ? '全解除' : '全選択'}（{selectedLineFriends.length}人選択中）
                </button>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {lineFriends.map((f) => (
                    <label key={f.line_user_id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-[var(--theme-border)] text-sm font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLineFriends.includes(f.line_user_id)}
                        onChange={(e) => setSelectedLineFriends((prev) =>
                          e.target.checked ? [...prev, f.line_user_id] : prev.filter((id) => id !== f.line_user_id)
                        )}
                        className="w-4 h-4"
                      />
                      {f.display_name || f.line_user_id}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--theme-text)]/50 text-center py-4">友だちデータがありません</p>
            )
          )}
        </section>

        {/* 送信内容 */}
        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] mb-6">
          <h2 className="text-sm font-black italic uppercase mb-4">送信内容</h2>

          {/* タイトル入力 + AI生成ボタン */}
          <div className="mb-4">
            <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">タイトル / テーマ（任意）</label>
            <input
              type="text"
              value={messageTitle}
              onChange={(e) => setMessageTitle(e.target.value)}
              placeholder="例: ご来店ありがとうございました"
              className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => generateMessage(true)}
                disabled={isGenerating || !messageTitle.trim()}
                className="flex-1 py-3 rounded-xl border-[3px] border-[var(--theme-border)] font-black text-xs shadow-[4px_4px_0px_var(--theme-border)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40"
              >
                {isGenerating ? '生成中...' : '✨ タイトルからAI生成'}
              </button>
              <button
                onClick={() => generateMessage(false)}
                disabled={isGenerating}
                className="flex-1 py-3 rounded-xl border-[3px] border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 font-black text-xs shadow-[4px_4px_0px_var(--theme-border)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40"
              >
                {isGenerating ? '生成中...' : '🤖 すべてAI生成'}
              </button>
            </div>
          </div>

          {/* メッセージ本文 */}
          <div>
            <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">メッセージ本文</label>
            <textarea
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
              placeholder="送信する内容を入力、またはAI生成してください"
              rows={6}
              className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
            />
            <p className="text-[9px] text-[var(--theme-text)]/40 mt-1">※ アンケートURLはAI生成時に自動挿入されます</p>
          </div>
        </section>

        {/* 結果表示 */}
        {sendResult && (
          <div className={`mb-6 p-4 rounded-2xl border-[3px] text-sm font-bold ${
            sendResult.success ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'
          }`}>
            {sendResult.message}
          </div>
        )}

        {/* 送信ボタン */}
        <button
          onClick={handleSend}
          disabled={sendLoading}
          className="w-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[3px] border-[var(--theme-border)] py-5 rounded-2xl font-black text-sm italic shadow-[8px_8px_0px_var(--theme-border)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
        >
          {sendLoading ? '送信中...' : '送信する'}
        </button>
      </div>
    </div>
  );
}
