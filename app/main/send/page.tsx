"use client";

import React, { Suspense, useState, useEffect, useRef } from 'react';
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
  const [messageSubject, setMessageSubject] = useState('');
  const [emailHtml, setEmailHtml] = useState('');
  const [isSyncingFriends, setIsSyncingFriends] = useState(false);
  const [templateType, setTemplateType] = useState<'survey' | 'campaign' | 'aftercare'>('survey');
  const [campaignText, setCampaignText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lineFriends, setLineFriends] = useState<LineFriend[]>([]);
  const [selectedLineFriends, setSelectedLineFriends] = useState<string[]>([]);
  const [quotas, setQuotas] = useState<{ sms?: { used: number; limit: number }; email?: { used: number; limit: number } } | null>(null);
  const [lineQuota, setLineQuota] = useState<{ configured: boolean; used?: number; limit?: number } | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailEmail, setGmailEmail] = useState('');

  // Refs & CSV help
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [showCsvHelp, setShowCsvHelp] = useState(false);

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
    fetch(`/api/google/auth?action=status&customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()).then((d) => { setGmailConnected(Boolean(d.connected)); setGmailEmail(d.email || ''); }).catch(() => {});
  }, [authChecking, customerId]);

  if (authChecking) return null;

  // CSV/テキスト一括取り込み
  const parseRecipients = (text: string): string[] => {
    // カンマ、セミコロン、タブ、改行で分割し、前後空白除去、空行除去
    return text
      .split(/[,;\t\n\r]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      // CSVの各行から送信先を抽出（1列目 or email/phone列を自動検出）
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) return;

      // ヘッダー行の検出
      const header = lines[0].toLowerCase();
      const isEmail = sendChannel === 'email';
      const cols = header.split(/[,\t]/);
      let targetCol = 0; // デフォルト: 1列目

      if (isEmail) {
        const emailIdx = cols.findIndex((c) => c.includes('email') || c.includes('メール') || c.includes('mail'));
        if (emailIdx >= 0) targetCol = emailIdx;
      } else {
        const phoneIdx = cols.findIndex((c) => c.includes('phone') || c.includes('電話') || c.includes('tel') || c.includes('sms'));
        if (phoneIdx >= 0) targetCol = phoneIdx;
      }

      // ヘッダー行をスキップするかどうか判定
      const firstVal = cols[targetCol]?.trim() || '';
      const hasHeader = isEmail
        ? !firstVal.includes('@')
        : !/^\+?\d/.test(firstVal);

      const dataLines = hasHeader ? lines.slice(1) : lines;
      const extracted = dataLines
        .map((line) => {
          const parts = line.split(/[,\t]/);
          return (parts[targetCol] || '').trim().replace(/^["']|["']$/g, '');
        })
        .filter(Boolean);

      if (!extracted.length) {
        showNotice('CSVから送信先を読み取れませんでした', 'error');
        return;
      }

      // 既存の送信先にマージ（重複除去）
      const existing = parseRecipients(sendRecipients);
      const merged = [...new Set([...existing, ...extracted])];
      setSendRecipients(merged.join('\n'));
      showNotice(`${extracted.length}件の送信先を取り込みました`, 'success');
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    // タブ区切り（Excelからのペースト）を検出
    if (pasted.includes('\t')) {
      e.preventDefault();
      const extracted = parseRecipients(pasted);
      const existing = parseRecipients(sendRecipients);
      const merged = [...new Set([...existing, ...extracted])];
      setSendRecipients(merged.join('\n'));
      showNotice(`${extracted.length}件の送信先を貼り付けました`, 'success');
    }
  };

  const recipientCount = parseRecipients(sendRecipients).length;

  const applyTemplate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          templateType,
          channel: sendChannel,
          campaign: campaignText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (sendChannel === 'email' && data.subject) {
          setMessageSubject(data.subject);
          setSendMessage(data.body || '');
          setEmailHtml(data.html || '');
        } else {
          setSendMessage(data.message || '');
          setEmailHtml('');
        }
      } else {
        showNotice(data.error || 'テンプレート適用に失敗しました', 'error');
      }
    } catch {
      showNotice('テンプレート適用中にエラーが発生しました', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Sync editable iframe content back to emailHtml state
  const syncIframeContent = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const html = '<!DOCTYPE html>' + iframe.contentDocument.documentElement.outerHTML;
    setEmailHtml(html);
  };

  const handleSend = async () => {
    // Sync iframe content before sending
    if (sendChannel === 'email' && emailHtml) {
      syncIframeContent();
    }

    if (!sendMessage.trim() && !emailHtml.trim()) {
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

      // Get latest HTML from iframe
      let finalHtml = emailHtml;
      if (sendChannel === 'email' && iframeRef.current?.contentDocument) {
        finalHtml = '<!DOCTYPE html>' + iframeRef.current.contentDocument.documentElement.outerHTML;
      }

      const res = await fetch('/api/send-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, channel: sendChannel, recipients, message: sendMessage, subject: messageSubject, html: finalHtml || undefined }),
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

  const channelIcons: Record<string, React.ReactNode> = {
    sms: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    email: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    line_broadcast: (
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 5.81 2 10.5c0 2.67 1.56 5.03 4 6.55V21l3.77-2.08c.72.13 1.47.2 2.23.2 5.52 0 10-3.81 10-8.5S17.52 2 12 2zm-1 11.5H8.5L7 11h2.5V8.5H11v5zm5.5 0H14V8.5h1v3h2l-1.5 2z"/>
      </svg>
    ),
    line_push: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  };

  const channels: { key: SendChannel; label: string }[] = [
    { key: 'sms', label: 'SMS' },
    { key: 'email', label: 'メール' },
    { key: 'line_broadcast', label: 'LINE全員' },
    { key: 'line_push', label: 'LINE個別' },
  ];

  // Inject contenteditable styles into the iframe
  const setupEditableIframe = (iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      // Make text elements editable
      const editableSelectors = 'h1, h2, h3, p, td, a, span, strong';
      doc.querySelectorAll(editableSelectors).forEach((el) => {
        const htmlEl = el as HTMLElement;
        // Skip elements that are purely structural
        if (htmlEl.children.length > 0 && !htmlEl.textContent?.trim()) return;
        htmlEl.contentEditable = 'true';
        htmlEl.style.outline = 'none';
        htmlEl.style.cursor = 'text';
        htmlEl.addEventListener('focus', () => {
          htmlEl.style.outline = '2px solid #4A90E2';
          htmlEl.style.outlineOffset = '2px';
          htmlEl.style.borderRadius = '4px';
        });
        htmlEl.addEventListener('blur', () => {
          htmlEl.style.outline = 'none';
          htmlEl.style.outlineOffset = '0';
        });
      });
      // Add editing hint style
      const style = doc.createElement('style');
      style.textContent = `
        [contenteditable="true"]:hover {
          outline: 1px dashed #ccc !important;
          outline-offset: 2px;
          border-radius: 4px;
        }
      `;
      doc.head.appendChild(style);
    };
    iframe.addEventListener('load', onLoad);
    // If already loaded
    if (iframe.contentDocument?.readyState === 'complete') {
      onLoad();
    }
  };

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] font-sans">
      {notice && <NoticeToast message={notice.message} variant={notice.variant} onClose={clearNotice} />}

      <div className="max-w-2xl mx-auto p-6 md:p-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black t-italic tracking-tighter">アンケート送信</h1>
            <p className="text-[10px] font-black text-[var(--theme-text)]/40 uppercase tracking-widest mt-1">Send Survey</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/main/send/history?customerId=${encodeURIComponent(customerId)}`}
              className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] text-xs font-black"
            >
              送信履歴
            </Link>
            <Link
              href={`/main?customerId=${encodeURIComponent(customerId)}`}
              className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] text-xs font-black"
            >
              ← 戻る
            </Link>
          </div>
        </div>

        {/* 残送信数ゲージ */}
        <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-5 shadow-[var(--theme-shadow)] mb-6">
          <h2 className="text-[10px] font-black t-italic uppercase mb-3 text-[var(--theme-text)]/60">今月の残送信数</h2>
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
        <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)] mb-6">
          <h2 className="text-sm font-black t-italic uppercase mb-4">送信方法を選択</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {channels.map((ch) => (
              <button
                key={ch.key}
                onClick={() => { setSendChannel(ch.key); setSendResult(null); }}
                className={`p-4 rounded-2xl border-[length:var(--theme-bw)] font-black text-xs transition-all text-center ${
                  sendChannel === ch.key
                    ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 shadow-[var(--theme-shadow-sm)]'
                    : 'border-[var(--theme-border)]'
                }`}
              >
                <div className="flex justify-center mb-2">{channelIcons[ch.key]}</div>
                {ch.label}
              </button>
            ))}
          </div>
        </section>

        {/* 送信先 */}
        <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)] mb-6">
          <h2 className="text-sm font-black t-italic uppercase mb-4">送信先</h2>
          {sendChannel === 'sms' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleCsvUpload} className="hidden" />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border-2 border-[var(--theme-border)] text-[10px] font-black"
                >
                  CSVから取り込み
                </button>
                <button
                  onClick={() => setShowCsvHelp(!showCsvHelp)}
                  className="w-5 h-5 rounded-full border-2 border-[var(--theme-border)] text-[10px] font-black flex items-center justify-center text-[var(--theme-text)]/50"
                  title="CSVフォーマットの説明"
                >
                  ?
                </button>
                {recipientCount > 0 && (
                  <span className="text-[10px] font-black text-[var(--theme-primary)]">{recipientCount}件</span>
                )}
              </div>
              {showCsvHelp && (
                <div className="mb-3 p-4 rounded-xl bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] text-[11px] text-[var(--theme-text)]/70 space-y-2">
                  <p className="font-black text-[var(--theme-text)]">CSVファイルの作り方</p>
                  <p>電話番号が含まれた列を自動検出します。ヘッダー行は自動スキップされます。</p>
                  <div className="bg-[var(--theme-card-bg)] rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                    <p className="text-[var(--theme-text)]/40">--- パターン1: 電話番号だけ ---</p>
                    <p>+8190xxxx0001</p>
                    <p>+8180xxxx0002</p>
                  </div>
                  <div className="bg-[var(--theme-card-bg)] rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                    <p className="text-[var(--theme-text)]/40">--- パターン2: ヘッダー付きCSV ---</p>
                    <p>名前,電話番号</p>
                    <p>山田太郎,+819012345678</p>
                    <p>佐藤花子,+818098765432</p>
                  </div>
                  <div className="bg-[var(--theme-card-bg)] rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                    <p className="text-[var(--theme-text)]/40">--- パターン3: 複数列CSV ---</p>
                    <p>id,name,phone,email</p>
                    <p>1,山田太郎,+819012345678,yamada@example.com</p>
                    <p>2,佐藤花子,+818098765432,sato@example.com</p>
                  </div>
                  <p className="text-[9px] text-[var(--theme-text)]/40">「電話」「phone」「tel」「sms」を含む列名を自動検出します。該当列がない場合は1列目を使用します。Excelから直接コピー&ペーストも可能です。</p>
                </div>
              )}
              <textarea
                value={sendRecipients}
                onChange={(e) => setSendRecipients(e.target.value)}
                onPaste={handlePaste}
                placeholder={"+8190xxxxxxxx\n+8180xxxxxxxx\n\nExcelからの貼り付け・CSV取り込みも可能"}
                rows={3}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
              <p className="text-[9px] text-[var(--theme-text)]/40 mt-1">1行1件、またはカンマ/タブ区切り。Excelからの貼り付けにも対応</p>
            </div>
          )}
          {sendChannel === 'email' && gmailConnected === false && (
            <div className="text-center py-4">
              <p className="text-sm font-black text-red-500 mb-2">Gmail連携が必要です</p>
              <a
                href={`/main/settings?customerId=${encodeURIComponent(customerId)}`}
                className="inline-block px-6 py-3 rounded-xl border-[length:var(--theme-bw)] border-[var(--theme-border)] text-xs font-black"
              >
                設定画面でGoogleアカウントを連携する →
              </a>
            </div>
          )}
          {sendChannel === 'email' && gmailConnected !== false && (
            <div>
              {gmailEmail && <p className="text-[10px] font-black text-green-600 mb-2">送信元: {gmailEmail}</p>}
              <div className="flex items-center gap-2 mb-2">
                <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleCsvUpload} className="hidden" />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border-2 border-[var(--theme-border)] text-[10px] font-black"
                >
                  CSVから取り込み
                </button>
                <button
                  onClick={() => setShowCsvHelp(!showCsvHelp)}
                  className="w-5 h-5 rounded-full border-2 border-[var(--theme-border)] text-[10px] font-black flex items-center justify-center text-[var(--theme-text)]/50"
                  title="CSVフォーマットの説明"
                >
                  ?
                </button>
                {recipientCount > 0 && (
                  <span className="text-[10px] font-black text-[var(--theme-primary)]">{recipientCount}件</span>
                )}
              </div>
              {showCsvHelp && (
                <div className="mb-3 p-4 rounded-xl bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] text-[11px] text-[var(--theme-text)]/70 space-y-2">
                  <p className="font-black text-[var(--theme-text)]">CSVファイルの作り方</p>
                  <p>メールアドレスが含まれた列を自動検出します。ヘッダー行は自動スキップされます。</p>
                  <div className="bg-[var(--theme-card-bg)] rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                    <p className="text-[var(--theme-text)]/40">--- パターン1: メールアドレスだけ ---</p>
                    <p>yamada@example.com</p>
                    <p>sato@example.com</p>
                  </div>
                  <div className="bg-[var(--theme-card-bg)] rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                    <p className="text-[var(--theme-text)]/40">--- パターン2: ヘッダー付きCSV ---</p>
                    <p>名前,メールアドレス</p>
                    <p>山田太郎,yamada@example.com</p>
                    <p>佐藤花子,sato@example.com</p>
                  </div>
                  <div className="bg-[var(--theme-card-bg)] rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                    <p className="text-[var(--theme-text)]/40">--- パターン3: 複数列CSV ---</p>
                    <p>id,name,email,phone</p>
                    <p>1,山田太郎,yamada@example.com,+819012345678</p>
                    <p>2,佐藤花子,sato@example.com,+818098765432</p>
                  </div>
                  <p className="text-[9px] text-[var(--theme-text)]/40">「email」「メール」「mail」を含む列名を自動検出します。該当列がない場合は1列目を使用します。Excelから直接コピー&ペーストも可能です。</p>
                </div>
              )}
              <textarea
                value={sendRecipients}
                onChange={(e) => setSendRecipients(e.target.value)}
                onPaste={handlePaste}
                placeholder={"test@example.com\nuser@example.com\n\nExcelからの貼り付け・CSV取り込みも可能"}
                rows={3}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
              <p className="text-[9px] text-[var(--theme-text)]/40 mt-1">1行1件、またはカンマ/タブ区切り。Excelからの貼り付けにも対応</p>
            </div>
          )}
          {sendChannel === 'line_broadcast' && (
            <p className="text-sm font-black text-center py-4">友だち全員に送信されます</p>
          )}
          {sendChannel === 'line_push' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-black text-[var(--theme-text)]/60">友だち {lineFriends.length}人</span>
                <button
                  onClick={async () => {
                    setIsSyncingFriends(true);
                    try {
                      const res = await fetch('/api/line-friends', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ customerId }),
                      });
                      const data = await res.json();
                      if (res.ok && data.success) {
                        showNotice(`${data.syncedCount}人の友だちを同期しました`, 'success');
                        const friendsRes = await fetch(`/api/line-friends?customerId=${encodeURIComponent(customerId)}`);
                        const friendsData = await friendsRes.json();
                        setLineFriends(friendsData.friends || []);
                      } else {
                        showNotice(data.error || '同期に失敗しました', 'error');
                      }
                    } catch {
                      showNotice('同期中にエラーが発生しました', 'error');
                    } finally {
                      setIsSyncingFriends(false);
                    }
                  }}
                  disabled={isSyncingFriends}
                  className="px-3 py-1.5 rounded-lg border-2 border-[var(--theme-border)] text-[10px] font-black disabled:opacity-50"
                >
                  {isSyncingFriends ? '同期中...' : '友だちリストを同期'}
                </button>
              </div>
              {lineFriends.length ? (
                <>
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
                </>
              ) : (
                <div className="text-center py-4">
                <p className="text-sm text-[var(--theme-text)]/50">「友だちリストを同期」ボタンを押してLINEから取得してください</p>
                <p className="text-[10px] text-[var(--theme-text)]/40 mt-2">※ 友だちリスト同期はLINE認証済みアカウント（青バッジ）またはプレミアムアカウントのみ利用可能です。未認証の場合はWebhook経由で新規友だち追加時に自動蓄積されます。<br /><a href="https://www.lycbiz.com/jp/service/line-official-account/verified-account/" target="_blank" rel="noopener noreferrer" className="underline text-[var(--theme-primary)]">認証済みアカウントとは？</a></p>
              </div>
              )}
            </div>
          )}
        </section>


        {/* 送信内容 */}
        <section className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-[var(--theme-radius)] p-6 shadow-[var(--theme-shadow)] mb-6">
          <h2 className="text-sm font-black t-italic uppercase mb-4">送信内容</h2>

          {/* テンプレート選択 */}
          <div className="space-y-3 mb-5">
            <label className="text-[11px] font-black text-[var(--theme-text)]/60 block">テンプレートを選択</label>
            {([
              { key: 'survey' as const, label: '通常版', desc: 'アンケートのお願い — 誠実さを伝えるオーソドックスなスタイル' },
              { key: 'campaign' as const, label: '特典あり版', desc: 'キャンペーン告知 — 特典をフックに回答率を最大化' },
              { key: 'aftercare' as const, label: 'アフターフォロー版', desc: 'フォローのついでに依頼 — 気遣いから入る押し付けないスタイル' },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTemplateType(t.key)}
                className={`w-full text-left p-4 rounded-2xl border-[length:var(--theme-bw)] transition-all ${
                  templateType === t.key
                    ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 shadow-[var(--theme-shadow-sm)]'
                    : 'border-[var(--theme-border)]'
                }`}
              >
                <span className="text-sm font-black block">{t.label}</span>
                <span className="text-[11px] text-[var(--theme-text)]/50 block mt-1">{t.desc}</span>
              </button>
            ))}
          </div>

          {/* キャンペーン内容（特典あり版の場合） */}
          {templateType === 'campaign' && (
            <div className="mb-5">
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">特典 / お礼内容</label>
              <input
                type="text"
                value={campaignText}
                onChange={(e) => setCampaignText(e.target.value)}
                placeholder="例: 次回10%OFFクーポン"
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
            </div>
          )}

          {/* テンプレート適用ボタン */}
          <div className="mb-4">
            <button
              onClick={applyTemplate}
              disabled={isGenerating}
              className="w-full py-3 rounded-xl border-[length:var(--theme-bw)] border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 font-black text-xs shadow-[var(--theme-shadow-sm)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40"
            >
              {isGenerating ? '適用中...' : 'テンプレートを適用する'}
            </button>
          </div>

          {/* メール件名（メール選択時のみ） */}
          {sendChannel === 'email' && (
            <div className="mb-3">
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">メール件名</label>
              <input
                type="text"
                value={messageSubject}
                onChange={(e) => setMessageSubject(e.target.value)}
                placeholder="件名を入力"
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
            </div>
          )}

          {/* メールプレビュー＆編集（メール選択時） */}
          {sendChannel === 'email' && emailHtml ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-black text-[var(--theme-text)]/60">メール本文（クリックして直接編集）</label>
              </div>
              <div className="border-[length:var(--theme-bw)] border-[var(--theme-border)] rounded-xl overflow-hidden" style={{ height: '600px' }}>
                <iframe
                  ref={(el) => { (iframeRef as React.MutableRefObject<HTMLIFrameElement | null>).current = el; setupEditableIframe(el); }}
                  srcDoc={emailHtml}
                  className="w-full h-full border-none"
                  title="メールプレビュー編集"
                />
              </div>
              <p className="text-[9px] text-[var(--theme-text)]/40 mt-1">※ テキスト部分をクリックすると直接編集できます。編集内容はそのまま送信されます。</p>
            </div>
          ) : sendChannel !== 'email' || !emailHtml ? (
            <div>
              <label className="text-[11px] font-black text-[var(--theme-text)]/60 mb-2 block">メッセージ本文</label>
              <textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="テンプレートを適用するか、直接入力してください"
                rows={8}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm"
              />
              <p className="text-[9px] text-[var(--theme-text)]/40 mt-1">※ テンプレート適用後に自由に編集できます</p>
            </div>
          ) : null}
        </section>

        {/* 結果表示 */}
        {sendResult && (
          <div className={`mb-6 p-4 rounded-2xl border-[length:var(--theme-bw)] text-sm font-bold ${
            sendResult.success ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'
          }`}>
            {sendResult.message}
          </div>
        )}

        {/* 送信ボタン */}
        <button
          onClick={handleSend}
          disabled={sendLoading}
          className="w-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-[length:var(--theme-bw)] border-[var(--theme-border)] py-5 rounded-2xl font-black text-sm t-italic shadow-[var(--theme-shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
        >
          {sendLoading ? '送信中...' : '送信する'}
        </button>
      </div>
    </div>
  );
}
