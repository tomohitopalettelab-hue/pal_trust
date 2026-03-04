"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LoadingSpinner from '../components/LoadingSpinner';
import NoticeToast from '../components/NoticeToast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useNotice } from '../components/useNotice';

type CustomerListItem = {
  customerId: string;
  customerName: string;
  mainPagePath: string;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  surveyCount: number;
  averageRating: number;
  lastResponseAt: string | null;
  currentSettings: Record<string, unknown> | null;
  surveyItems: Array<{ id: number; text: string; type: string }>;
};

type CreateAccountResponse = {
  ok: boolean;
  customerId: string;
  mainPagePath: string;
};

type CreateAccountErrorResponse = {
  error?: string;
};

export default function PlatformAdminPage() {
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [customerList, setCustomerList] = useState<CustomerListItem[]>([]);
  const [loadingCustomerList, setLoadingCustomerList] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deleteTargetCustomerId, setDeleteTargetCustomerId] = useState<string | null>(null);
  const { notice, showNotice, clearNotice } = useNotice();

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
    if (authChecking) {
      return;
    }

    const loadCustomerList = async () => {
      setLoadingCustomerList(true);
      try {
        const res = await fetch('/api/admin/customers-list');
        const data: CustomerListItem[] = await res.json();
        setCustomerList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('顧客一覧の取得に失敗しました:', error);
        setCustomerList([]);
      } finally {
        setLoadingCustomerList(false);
      }
    };

    loadCustomerList();
  }, [authChecking]);

  const filteredCustomerList = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const source = keyword
      ? customerList.filter((item) => {
      const idMatch = item.customerId.toLowerCase().includes(keyword);
      const nameMatch = (item.customerName || '').toLowerCase().includes(keyword);
      return idMatch || nameMatch;
    })
      : customerList;

    return [...source].sort((a, b) => {
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (bCreated !== aCreated) {
        return bCreated - aCreated;
      }
      const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (bUpdated !== aUpdated) {
        return bUpdated - aUpdated;
      }
      return a.customerId.localeCompare(b.customerId);
    });
  }, [customerList, searchKeyword]);

  const formatDateTime = (value: string | null) => {
    if (!value) return '未記録';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未記録';
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const refreshCustomerList = async () => {
    const res = await fetch('/api/admin/customers-list');
    const data: CustomerListItem[] = await res.json();
    setCustomerList(Array.isArray(data) ? data : []);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      showNotice('パスワードを入力してください', 'error');
      return;
    }

    setSavingAccount(true);
    try {
      const res = await fetch('/api/admin/customer-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: newCustomerId, customerName: newCustomerName, password: newPassword }),
      });

      const data: CreateAccountResponse | CreateAccountErrorResponse = await res.json();
      if (!res.ok) {
        throw new Error('error' in data ? data.error || '保存に失敗しました' : '保存に失敗しました');
      }

      await refreshCustomerList();
      const createdCustomerId = (data as CreateAccountResponse).customerId;
      const createdMainPagePath = (data as CreateAccountResponse).mainPagePath;
      setNewCustomerId('');
      setNewCustomerName('');
      setNewPassword('');
      showNotice(`顧客を登録しました（ID: ${createdCustomerId} / main: ${createdMainPagePath}）`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '保存に失敗しました', 'error');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleCopyUrl = async (copyKey: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(copyKey);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === copyKey ? null : prev));
      }, 1500);
    } catch {
      showNotice('URLのコピーに失敗しました', 'error');
    }
  };

  const executeDeleteCustomer = async (customerId: string) => {
    try {
      const res = await fetch(`/api/admin/customer-accounts?customerId=${encodeURIComponent(customerId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '削除に失敗しました');
      }
      await refreshCustomerList();
      showNotice(`顧客 ${customerId} を削除しました`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '削除に失敗しました', 'error');
    } finally {
      setDeleteTargetCustomerId(null);
    }
  };

  const handleToggleCustomerActive = async (customerId: string, nextIsActive: boolean) => {
    try {
      const res = await fetch('/api/admin/customer-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, isActive: nextIsActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '状態更新に失敗しました');
      }
      await refreshCustomerList();
      showNotice(`顧客 ${customerId} を${nextIsActive ? '再開' : '停止'}しました`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '状態更新に失敗しました', 'error');
    }
  };

  if (authChecking) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] p-6 md:p-10 font-sans">
      {notice && (
        <NoticeToast
          message={notice.message}
          variant={notice.variant}
          onClose={clearNotice}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTargetCustomerId)}
        title="顧客を削除"
        message={deleteTargetCustomerId ? `顧客 ${deleteTargetCustomerId} を削除しますか？` : ''}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onCancel={() => setDeleteTargetCustomerId(null)}
        onConfirm={() => {
          if (deleteTargetCustomerId) {
            executeDeleteCustomer(deleteTargetCustomerId);
          }
        }}
      />
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text)]/50">Platform Admin</p>
          <h1 className="text-3xl md:text-4xl font-black italic tracking-tight">顧客別データ管理</h1>
          <p className="text-sm font-bold text-[var(--theme-text)]/60 mt-2">顧客を選択すると、対象顧客の回答データを確認できます。</p>
        </header>

        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black italic mb-4">顧客ID / パスワード管理</h2>

          <form onSubmit={handleSaveAccount} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
              placeholder="顧客ID（空欄で自動生成）"
              className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 font-black outline-none"
            />
            <input
              type="text"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="顧客名"
              className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 font-black outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="password"
              className="bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 font-black outline-none"
            />
            <button
              type="submit"
              disabled={savingAccount}
              className="bg-[var(--theme-primary)] text-[var(--theme-on-primary)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 font-black disabled:opacity-60"
            >
              {savingAccount ? 'SAVING...' : 'ID/PWを保存'}
            </button>
          </form>

        </section>

        <section className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] rounded-[2rem] p-6 shadow-[8px_8px_0px_var(--theme-border)]">
          <h2 className="text-xl font-black italic mb-4">顧客一覧（main / survey 提供情報）</h2>

          <div className="mb-4">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="顧客IDまたは顧客名で検索"
              className="w-full md:w-[420px] bg-[var(--theme-bg)] border-2 border-[var(--theme-border)] rounded-xl px-4 py-3 font-black outline-none"
            />
          </div>

          {loadingCustomerList ? (
            <p className="text-sm font-black text-[var(--theme-text)]/60">顧客一覧を読み込み中...</p>
          ) : customerList.length === 0 ? (
            <p className="text-sm font-black text-[var(--theme-text)]/60">顧客情報がまだありません。</p>
          ) : filteredCustomerList.length === 0 ? (
            <p className="text-sm font-black text-[var(--theme-text)]/60">検索結果がありません。</p>
          ) : (
            <div className="space-y-3">
              {filteredCustomerList.map((item) => {
                const appName = String(item.currentSettings?.appName || item.customerName || '未設定');
                const themeName = String(item.currentSettings?.themeName || 'standard');
                const mapRule = String(item.currentSettings?.minStarsForGoogle || '4');
                const mainPath = item.mainPagePath || `/main?customerId=${encodeURIComponent(item.customerId)}`;
                const surveyPath = `/survey?customerId=${encodeURIComponent(item.customerId)}`;
                const mainUrl = `${baseUrl}${mainPath}`;
                const surveyUrl = `${baseUrl}${surveyPath}`;

                return (
                  <article
                    key={item.customerId}
                    className={`border-2 rounded-xl p-4 space-y-3 ${
                      item.isActive
                        ? 'bg-[var(--theme-bg)] border-[var(--theme-border)]'
                        : 'bg-gray-100 border-gray-400'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="text-lg font-black">{item.customerName || '（顧客名未設定）'}</p>
                        <p className="text-[11px] font-black text-[var(--theme-text)]/50">顧客ID: {item.customerId}</p>
                      </div>
                      <div className="text-[11px] font-black text-[var(--theme-text)]/60">
                          PW: {item.hasPassword ? '設定済み（再設定可）' : '未設定'} / 状態: {item.isActive ? '稼働中' : '停止中'}
                      </div>
                    </div>

                    {!item.isActive && (
                      <p className="text-[11px] font-black text-gray-600">この顧客は現在停止中です（URLアクセス不可）</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-black">
                      <p>main URL: {mainUrl || mainPath}</p>
                      <p>survey URL: {surveyUrl || surveyPath}</p>
                      <p>現在テーマ: {themeName}</p>
                      <p>Google誘導基準: ★{mapRule}以上</p>
                      <p>アプリ表示名: {appName}</p>
                      <p>回答数: {item.surveyCount} / 平均: {item.averageRating.toFixed(2)}</p>
                      <p>登録日時: {formatDateTime(item.createdAt)}</p>
                      <p>最終更新日時: {formatDateTime(item.updatedAt)}</p>
                    </div>

                    <div className="text-[11px] font-black text-[var(--theme-text)]/70">
                      survey設問データ: {item.surveyItems.length > 0 ? item.surveyItems.map((q) => q.text).join(' / ') : '未設定'}
                    </div>

                    <div className="pt-1 border-t border-dashed border-[var(--theme-border)]/40">
                      <p className="text-[10px] font-black text-[var(--theme-text)]/60 mb-2">操作ボタン</p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleToggleCustomerActive(item.customerId, !item.isActive)}
                        className={`px-3 py-2 rounded-lg border-2 font-black text-xs shadow-[2px_2px_0px_var(--theme-border)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer ${item.isActive ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-emerald-500 bg-emerald-100 text-emerald-800'}`}
                      >
                        {item.isActive ? '停止' : '再開'}
                      </button>
                      <button
                        onClick={() => handleCopyUrl(`main:${item.customerId}`, mainUrl)}
                        className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs shadow-[2px_2px_0px_var(--theme-border)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                      >
                        {copiedKey === `main:${item.customerId}` ? 'コピー済み！' : 'main URLをコピー'}
                      </button>
                      <button
                        onClick={() => handleCopyUrl(`survey:${item.customerId}`, surveyUrl)}
                        className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs shadow-[2px_2px_0px_var(--theme-border)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                      >
                        {copiedKey === `survey:${item.customerId}` ? 'コピー済み！' : 'survey URLをコピー'}
                      </button>
                      <Link
                        href={`/platform-admin/customers/${encodeURIComponent(item.customerId)}`}
                        className="px-3 py-2 rounded-lg border-2 border-[var(--theme-border)] font-black text-xs shadow-[2px_2px_0px_var(--theme-border)] active:translate-y-0.5 active:shadow-none transition-all"
                      >
                        詳細を見る
                      </Link>
                      <button
                        onClick={() => setDeleteTargetCustomerId(item.customerId)}
                        className="px-3 py-2 rounded-lg border-2 border-red-500 bg-red-50 text-red-700 font-black text-xs shadow-[2px_2px_0px_var(--theme-border)] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                      >
                        削除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
