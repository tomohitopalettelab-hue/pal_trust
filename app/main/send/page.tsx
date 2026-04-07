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

function SendSurveyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || '';
  const { notice, showNotice, clearNotice } = useNotice();

  const [authChecking, setAuthChecking] = useState(true);
  const [sendChannel, setSendChannel] = useState<SendChannel>('sms');
  const [sendRecipients, setSendRecipients] = useState('');
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

  // 使用量とLINE友だち取得
  useEffect(() => {
    if (authChecking || !customerId) return;
    fetch(`/api/send-quota?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then(setQuotas).catch(() => {});
    fetch(`/api/line-quota?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then(setLineQuota).catch(() => {});
    fetch(`/api/line-friends?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then((d) => setLineFriends(d.friends || [])).catch(() => {});
  }, [authChecking, customerId]);

  if (authChecking) return null;

  const handleSend = async () => {
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
        body: JSON.stringify({ customerId, channel: sendChannel, recipients }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSendResult({ success: true, message: `${data.sentCount}件送信しました！` });
        setSendRecipients('');
        setSelectedLineFriends([]);
        showNotice(`${data.sentCount}件送信しました！`, 'success');
        // 使用量を再取得
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

  const channels: { key: SendChannel; label: string; icon: string; desc: string }[] = [
    { key: 'sms', label: 'SMS', icon: '📱', desc: `今月 ${quotas?.sms?.used || 0}/${quotas?.sms?.limit || 100}通` },
    { key: 'email', label: 'メール', icon: '✉️', desc: `今月 ${quotas?.email?.used || 0}/${quotas?.email?.limit || 3000}通` },
    { key: 'line_broadcast', label: 'LINE全員', icon: '💬', desc: lineQuota?.configured ? `今月 ${lineQuota.used || 0}/${lineQuota.limit || 0}通` : '未設定' },
    { key: 'line_push', label: 'LINE個別', icon: '👤', desc: `友だち ${lineFriends.length}人` },
  ];

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      {notice && <NoticeToast message={notice.message} variant={notice.variant} onClose={clearNotice} />}

      <div className="max-w-2xl mx-auto p-6 md:p-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
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
                <span className="block">{ch.label}</span>
                <span className="block text-[10px] text-[var(--theme-text)]/50 mt-1">{ch.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 宛先入力 */}
        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] mb-6">
          <h2 className="text-sm font-black italic uppercase mb-4">送信先</h2>

          {sendChannel === 'sms' && (
            <div>
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">電話番号（改行区切りで複数可）</label>
              <textarea
                value={sendRecipients}
                onChange={(e) => setSendRecipients(e.target.value)}
                placeholder={"+8190xxxxxxxx\n+8180xxxxxxxx"}
                rows={4}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
            </div>
          )}

          {sendChannel === 'email' && (
            <div>
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">メールアドレス（改行区切りで複数可）</label>
              <textarea
                value={sendRecipients}
                onChange={(e) => setSendRecipients(e.target.value)}
                placeholder={"test@example.com\nuser@example.com"}
                rows={4}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
            </div>
          )}

          {sendChannel === 'line_broadcast' && (
            <div className="text-center py-6">
              <span className="text-4xl block mb-3">💬</span>
              <p className="text-sm font-black">LINE公式アカウントの友だち全員に送信します</p>
              <p className="text-[11px] text-[var(--theme-text)]/50 mt-1">※ 友だち全員にアンケートURLが届きます</p>
            </div>
          )}

          {sendChannel === 'line_push' && (
            <div>
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">送信先を選択（{selectedLineFriends.length}人選択中）</label>
              {lineFriends.length ? (
                <>
                  <button
                    onClick={() => setSelectedLineFriends(
                      selectedLineFriends.length === lineFriends.length ? [] : lineFriends.map((f) => f.line_user_id)
                    )}
                    className="text-[10px] font-black text-[var(--theme-primary)] mb-2"
                  >
                    {selectedLineFriends.length === lineFriends.length ? '全解除' : '全選択'}
                  </button>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {lineFriends.map((f) => (
                      <label key={f.line_user_id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-[var(--theme-border)] text-sm font-bold cursor-pointer hover:bg-[var(--theme-bg)] transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedLineFriends.includes(f.line_user_id)}
                          onChange={(e) => {
                            setSelectedLineFriends((prev) =>
                              e.target.checked ? [...prev, f.line_user_id] : prev.filter((id) => id !== f.line_user_id)
                            );
                          }}
                          className="w-4 h-4"
                        />
                        {f.display_name || f.line_user_id}
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-[var(--theme-text)]/50">友だちデータがありません</p>
                  <p className="text-[10px] text-[var(--theme-text)]/40 mt-1">LINE公式アカウントのWebhook設定が必要です</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 結果表示 */}
        {sendResult && (
          <div className={`mb-6 p-4 rounded-2xl border-[3px] text-sm font-bold ${
            sendResult.success
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-red-50 border-red-300 text-red-800'
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
