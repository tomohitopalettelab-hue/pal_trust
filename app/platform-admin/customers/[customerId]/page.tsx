"use client";

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LoadingSpinner from '../../../components/LoadingSpinner';
import NoticeToast from '../../../components/NoticeToast';
import { useNotice } from '../../../components/useNotice';

// --- 送信設定セクション ---
type QuotaInfo = { used: number; limit: number };
type LineQuotaInfo = { configured: boolean; used?: number; limit?: number; error?: string };

function QuotaBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] font-black text-[var(--theme-text)]/70 mb-1">
        <span>{label}</span>
        <span>{used} / {limit}通</span>
      </div>
      <div className="w-full h-2 bg-[var(--theme-bg)] rounded-full border border-[var(--theme-border)]">
        <div className="h-full rounded-full bg-[var(--theme-primary)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function maskToken(value: string): string {
  if (!value || value.length < 8) return value ? '****' : '';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function SendSettingsSection({
  customerId,
  isEditing,
  editSettings,
  setEditSettings,
  currentSettings,
}: {
  customerId: string;
  isEditing: boolean;
  editSettings: Record<string, unknown>;
  setEditSettings: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  currentSettings: Record<string, unknown>;
}) {
  const [smsQuota, setSmsQuota] = useState<QuotaInfo | null>(null);
  const [emailQuota, setEmailQuota] = useState<QuotaInfo | null>(null);
  const [lineQuota, setLineQuota] = useState<LineQuotaInfo | null>(null);

  const fetchQuotas = useCallback(async () => {
    try {
      const [sendRes, lineRes] = await Promise.all([
        fetch(`/api/send-quota?customerId=${encodeURIComponent(customerId)}`),
        fetch(`/api/line-quota?customerId=${encodeURIComponent(customerId)}`),
      ]);
      const sendData = await sendRes.json().catch(() => ({}));
      const lineData = await lineRes.json().catch(() => ({}));
      setSmsQuota(sendData.sms || { used: 0, limit: 100 });
      setEmailQuota(sendData.email || { used: 0, limit: 3000 });
      setLineQuota(lineData);
    } catch {
      // silent
    }
  }, [customerId]);

  useEffect(() => { fetchQuotas(); }, [fetchQuotas]);

  const settings = isEditing ? editSettings : currentSettings;
  const setField = (key: string, value: string) => setEditSettings((prev) => ({ ...prev, [key]: value }));

  const inputCls = "w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 text-sm disabled:opacity-70";

  return (
    <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] space-y-5">
      <h2 className="text-xl font-black italic">送信設定</h2>

      {/* SMS (Twilio) */}
      <div className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black">SMS（Twilio）</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">Account SID</span>
            <input
              type="text"
              value={isEditing ? String(editSettings.twilioAccountSid || '') : maskToken(String(currentSettings.twilioAccountSid || ''))}
              onChange={(e) => setField('twilioAccountSid', e.target.value)}
              disabled={!isEditing}
              placeholder="ACxxxxxxxxxx"
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">Auth Token</span>
            <input
              type={isEditing ? 'text' : 'password'}
              value={isEditing ? String(editSettings.twilioAuthToken || '') : String(currentSettings.twilioAuthToken || '')}
              onChange={(e) => setField('twilioAuthToken', e.target.value)}
              disabled={!isEditing}
              placeholder="xxxxxxxxxx"
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">送信元電話番号</span>
            <input
              type="text"
              value={String(settings.twilioPhoneNumber || '')}
              onChange={(e) => setField('twilioPhoneNumber', e.target.value)}
              disabled={!isEditing}
              placeholder="+8150xxxxxxxx"
              className={inputCls}
            />
          </label>
        </div>
        {smsQuota && <QuotaBar used={smsQuota.used} limit={smsQuota.limit} label="今月のSMS送信" />}
      </div>

      {/* LINE */}
      <div className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black">LINE公式アカウント</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">Channel Access Token</span>
            <input
              type={isEditing ? 'text' : 'password'}
              value={isEditing ? String(editSettings.lineChannelAccessToken || '') : String(currentSettings.lineChannelAccessToken || '')}
              onChange={(e) => setField('lineChannelAccessToken', e.target.value)}
              disabled={!isEditing}
              placeholder="トークンを入力"
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">Channel Secret</span>
            <input
              type={isEditing ? 'text' : 'password'}
              value={isEditing ? String(editSettings.lineChannelSecret || '') : String(currentSettings.lineChannelSecret || '')}
              onChange={(e) => setField('lineChannelSecret', e.target.value)}
              disabled={!isEditing}
              placeholder="シークレットを入力"
              className={inputCls}
            />
          </label>
        </div>
        {lineQuota && (
          lineQuota.configured
            ? lineQuota.error
              ? <p className="text-[11px] font-black text-red-500">{lineQuota.error}</p>
              : <QuotaBar used={lineQuota.used || 0} limit={lineQuota.limit || 0} label="今月のLINE送信" />
            : <p className="text-[11px] font-black text-[var(--theme-text)]/50">未設定</p>
        )}
      </div>

      {/* Email */}
      <div className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black">メール</h3>
        <p className="text-[11px] text-[var(--theme-text)]/70">共有APIキーを使用（顧客設定不要）</p>
        {emailQuota && <QuotaBar used={emailQuota.used} limit={emailQuota.limit} label="今月のメール送信" />}
      </div>
    </section>
  );
}

type SurveyItem = {
  id: number;
  text: string;
  type: string;
};

type LatestSurvey = {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
};

type CustomerDetailResponse = {
  customerId: string;
  customerName: string;
  mainPagePath: string;
  hasPassword: boolean;
  accountUpdatedAt: string | null;
  settingsUpdatedAt: string | null;
  settings: Record<string, unknown> | null;
  surveyItems: SurveyItem[];
  surveyCount: number;
  averageRating: number;
  latestSurveys: LatestSurvey[];
};

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ customerId: string }>();
  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editMainPagePath, setEditMainPagePath] = useState('');
  const [editSettings, setEditSettings] = useState<Record<string, unknown>>({});
  const [editSurveyItems, setEditSurveyItems] = useState<SurveyItem[]>([]);
  const { notice, showNotice, clearNotice } = useNotice();

  const customerId = useMemo(() => {
    const raw = params?.customerId;
    return raw ? decodeURIComponent(raw) : '';
  }, [params]);

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('platformAdminLoggedIn') === 'true';
    if (!isLoggedIn) {
      router.replace('/platform-admin/login');
      return;
    }
    setAuthChecking(false);
  }, [router]);

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (authChecking || !customerId) {
      return;
    }

    const loadDetail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`);
        const data: CustomerDetailResponse = await res.json();
        if (!res.ok) {
          throw new Error('顧客詳細の取得に失敗しました');
        }
        setDetail(data);
        setEditCustomerName(data.customerName || '');
        setEditMainPagePath(data.mainPagePath || `/main?customerId=${encodeURIComponent(customerId)}`);
        setEditSettings(data.settings || {});
        setEditSurveyItems(Array.isArray(data.surveyItems) ? data.surveyItems : []);
      } catch (error) {
        console.error(error);
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [authChecking, customerId]);

  if (authChecking) {
    return <LoadingSpinner />;
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  const currentSettings = detail?.settings || {};
  const appName = String(currentSettings.appName || detail?.customerName || '未設定');
  const themeName = String(currentSettings.themeName || 'standard');
  const minStars = String(currentSettings.minStarsForGoogle || '4');
  const adminGoogleMapUrl = String(currentSettings.adminGoogleMapUrl || 'https://business.google.com/');
  const surveyGoogleMapUrl = String(currentSettings.googleMapUrl || '');
  const mainPath = detail?.mainPagePath || `/main?customerId=${encodeURIComponent(customerId)}`;
  const surveyPath = `/survey?customerId=${encodeURIComponent(customerId)}`;
  const mainUrl = `${baseUrl}${mainPath}`;
  const surveyUrl = `${baseUrl}${surveyPath}`;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: editCustomerName,
          mainPagePath: editMainPagePath,
          settings: editSettings,
          surveyItems: editSurveyItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '保存に失敗しました');
      }

      const reloadRes = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`);
      const reloadData: CustomerDetailResponse = await reloadRes.json();
      if (!reloadRes.ok) {
        throw new Error('最新データの再取得に失敗しました');
      }
      setDetail(reloadData);
      setEditCustomerName(reloadData.customerName || '');
      setEditMainPagePath(reloadData.mainPagePath || `/main?customerId=${encodeURIComponent(customerId)}`);
      setEditSettings(reloadData.settings || {});
      setEditSurveyItems(Array.isArray(reloadData.surveyItems) ? reloadData.surveyItems : []);
      setIsEditing(false);
      showNotice('顧客詳細を保存しました');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '保存に失敗しました', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSurveyItemChange = (id: number, key: 'text' | 'type', value: string) => {
    setEditSurveyItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const handleAddSurveyItem = () => {
    setEditSurveyItems((prev) => [...prev, { id: Date.now(), text: '', type: 'free' }]);
  };

  const handleRemoveSurveyItem = (id: number) => {
    setEditSurveyItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] p-6 md:p-10 font-sans">
      {notice && (
        <NoticeToast
          message={notice.message}
          variant={notice.variant}
          onClose={clearNotice}
        />
      )}
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text)]/50">Platform Admin</p>
            <h1 className="text-3xl md:text-4xl font-black italic tracking-tight">顧客詳細</h1>
            <p className="text-sm font-bold text-[var(--theme-text)]/60 mt-2">顧客ID: {customerId}</p>
          </div>
          <Link
            href="/platform-admin"
            className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] font-black text-sm"
          >
            一覧へ戻る
          </Link>
        </header>

        <section className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing((prev) => !prev)}
            className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] font-black text-sm"
          >
            {isEditing ? '編集を閉じる' : '編集する'}
          </button>
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border-2 border-[var(--theme-border)] font-black text-sm bg-[var(--theme-primary)] text-[var(--theme-on-primary)] disabled:opacity-60"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          )}
        </section>

        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] space-y-3">
          <h2 className="text-xl font-black italic">基本情報</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-black">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--theme-text)]/70">顧客名</span>
              <input
                value={isEditing ? editCustomerName : (detail?.customerName || '')}
                onChange={(e) => setEditCustomerName(e.target.value)}
                disabled={!isEditing}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <p>ログインID: {(detail as any)?.chatLoginId || detail?.customerId || customerId}</p>
            <p>ログインPW: {detail?.hasPassword ? '設定済み（再設定は一覧画面）' : '未設定'}</p>
            <p>アカウント更新: {detail?.accountUpdatedAt ? new Date(detail.accountUpdatedAt).toLocaleString('ja-JP') : '-'}</p>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[11px] text-[var(--theme-text)]/70">main path</span>
              <input
                value={isEditing ? editMainPagePath : mainPath}
                onChange={(e) => setEditMainPagePath(e.target.value)}
                disabled={!isEditing}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <p className="md:col-span-2">main URL: {mainUrl || mainPath}</p>
            <p>survey URL: {surveyUrl || surveyPath}</p>
          </div>
        </section>

        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] space-y-3">
          <h2 className="text-xl font-black italic">現在の設定（main / survey）</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-black">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--theme-text)]/70">表示アプリ名</span>
              <input
                value={String(isEditing ? editSettings.appName || '' : appName)}
                onChange={(e) => setEditSettings((prev) => ({ ...prev, appName: e.target.value }))}
                disabled={!isEditing}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--theme-text)]/70">テーマ</span>
              <input
                value={String(isEditing ? editSettings.themeName || '' : themeName)}
                onChange={(e) => setEditSettings((prev) => ({ ...prev, themeName: e.target.value }))}
                disabled={!isEditing}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--theme-text)]/70">Google誘導基準（星）</span>
              <input
                value={String(isEditing ? editSettings.minStarsForGoogle || '' : minStars)}
                onChange={(e) => setEditSettings((prev) => ({ ...prev, minStarsForGoogle: e.target.value }))}
                disabled={!isEditing}
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--theme-text)]/70">業種</span>
              <input
                value={String(isEditing ? editSettings.industry || '' : currentSettings.industry || '')}
                onChange={(e) => setEditSettings((prev) => ({ ...prev, industry: e.target.value }))}
                disabled={!isEditing}
                placeholder="例: 美容院、飲食店、整体院"
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[11px] text-[var(--theme-text)]/70">admin GoogleMap URL</span>
              <input
                value={String(isEditing ? editSettings.adminGoogleMapUrl || '' : adminGoogleMapUrl)}
                onChange={(e) => setEditSettings((prev) => ({ ...prev, adminGoogleMapUrl: e.target.value }))}
                disabled={!isEditing}
                placeholder="https://business.google.com/"
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[11px] text-[var(--theme-text)]/70">誘導先 Google Map URL（survey）</span>
              <input
                value={String(isEditing ? editSettings.googleMapUrl || '' : surveyGoogleMapUrl)}
                onChange={(e) => setEditSettings((prev) => ({ ...prev, googleMapUrl: e.target.value }))}
                disabled={!isEditing}
                placeholder="https://goo.gl/maps/..."
                className="w-full bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
              />
            </label>
            <p className="md:col-span-2">設定更新: {detail?.settingsUpdatedAt ? new Date(detail.settingsUpdatedAt).toLocaleString('ja-JP') : '-'}</p>
          </div>
          <label className="block text-sm font-black text-[var(--theme-text)]/80 space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">高評価メッセージ</span>
            <textarea
              value={String(isEditing ? editSettings.thanksPageContent || '' : currentSettings.thanksPageContent || '')}
              onChange={(e) => setEditSettings((prev) => ({ ...prev, thanksPageContent: e.target.value }))}
              disabled={!isEditing}
              className="w-full min-h-[84px] bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
            />
          </label>
          <label className="block text-sm font-black text-[var(--theme-text)]/80 space-y-1">
            <span className="text-[11px] text-[var(--theme-text)]/70">低評価メッセージ</span>
            <textarea
              value={String(isEditing ? editSettings.lowRatingMessage || '' : currentSettings.lowRatingMessage || '')}
              onChange={(e) => setEditSettings((prev) => ({ ...prev, lowRatingMessage: e.target.value }))}
              disabled={!isEditing}
              className="w-full min-h-[84px] bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-3 py-2 disabled:opacity-70"
            />
          </label>
        </section>

        <SendSettingsSection
          customerId={customerId}
          isEditing={isEditing}
          editSettings={editSettings}
          setEditSettings={setEditSettings}
          currentSettings={currentSettings}
        />

        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black italic">Survey設問データ</h2>
            {isEditing && (
              <button
                onClick={handleAddSurveyItem}
                className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs"
              >
                + 設問追加
              </button>
            )}
          </div>
          {(isEditing ? editSurveyItems : detail?.surveyItems || []).length ? (
            <div className="space-y-2">
              {(isEditing ? editSurveyItems : detail?.surveyItems || []).map((item, index) => (
                <div key={item.id} className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl p-3 text-sm font-black space-y-2">
                  <div>Q{index + 1}</div>
                  <input
                    value={item.text}
                    onChange={(e) => handleSurveyItemChange(item.id, 'text', e.target.value)}
                    disabled={!isEditing}
                    className="w-full bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-lg px-3 py-2 disabled:opacity-70"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={item.type}
                      onChange={(e) => handleSurveyItemChange(item.id, 'type', e.target.value)}
                      disabled={!isEditing}
                      className="bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] rounded-lg px-3 py-2 disabled:opacity-70"
                    >
                      <option value="rating">rating</option>
                      <option value="free">free</option>
                      <option value="choice">choice</option>
                    </select>
                    {isEditing && (
                      <button
                        onClick={() => handleRemoveSurveyItem(item.id)}
                        className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-black text-[var(--theme-text)]/60">設問データは未設定です。</p>
          )}
        </section>

        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)] space-y-3">
          <h2 className="text-xl font-black italic">回答データ（最新20件）</h2>
          <p className="text-sm font-black text-[var(--theme-text)]/70">
            件数: {detail?.surveyCount ?? 0} / 平均評価: {(detail?.averageRating ?? 0).toFixed(2)}
          </p>
          {detail?.latestSurveys?.length ? (
            <div className="space-y-2">
              {detail.latestSurveys.map((survey) => (
                <div key={survey.id} className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl p-3">
                  <div className="flex items-center justify-between text-sm font-black mb-1">
                    <span>評価: {Number(survey.rating).toFixed(1)}</span>
                    <span className="text-[var(--theme-text)]/60">{new Date(survey.created_at).toLocaleString('ja-JP')}</span>
                  </div>
                  <p className="text-sm font-bold text-[var(--theme-text)]/80">{survey.comment || '（コメントなし）'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-black text-[var(--theme-text)]/60">回答データはまだありません。</p>
          )}
        </section>
      </div>
    </div>
  );
}
