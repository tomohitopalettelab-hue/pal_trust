"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NoticeToast from '../../components/NoticeToast';
import { useNotice } from '../../components/useNotice';

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { notice, showNotice, clearNotice } = useNotice();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotice();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/platform-admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'ログインに失敗しました');
      }

      localStorage.setItem('platformAdminLoggedIn', 'true');
      localStorage.setItem('platformAdminRole', data.role || 'agency');
      localStorage.setItem('platformAdminPaletteId', data.paletteId || '');
      localStorage.setItem('platformAdminAccountId', data.accountId || '');
      localStorage.setItem('platformAdminAccountName', data.accountName || '');
      router.push('/platform-admin');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'ログインに失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] flex items-center justify-center p-6 font-sans">
      {notice && <NoticeToast message={notice.message} variant={notice.variant} onClose={clearNotice} />}
      <div className="max-w-md w-full animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black t-italic tracking-tighter uppercase leading-none text-[var(--theme-text)]">
            Pal<span className="text-[var(--theme-primary)]">-</span>Trust
          </h1>
          <p className="text-[10px] font-black text-[var(--theme-text)] opacity-40 uppercase tracking-[0.3em] mt-3 t-italic">Platform Admin Login</p>
        </div>

        <div className="bg-[var(--theme-card-bg)] border-[length:var(--theme-bw)] border-[var(--theme-border)] p-10 rounded-[3.5rem] shadow-[var(--theme-shadow-lg)] relative overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 rounded-full blur-[80px] opacity-20 bg-[var(--theme-primary)]" />

          <form onSubmit={handleLogin} className="relative z-10 space-y-8">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase t-italic mb-3 block tracking-widest">Login ID</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="ログインID"
                className="w-full bg-[var(--theme-text)]/10 border-2 border-[var(--theme-border)]/20 rounded-2xl px-6 py-4 text-[var(--theme-text)] font-black t-italic placeholder:text-[var(--theme-text)]/30 focus:outline-none focus:border-[var(--theme-border)] transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase t-italic mb-3 block tracking-widest">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--theme-text)]/10 border-2 border-[var(--theme-border)]/20 rounded-2xl px-6 py-4 text-[var(--theme-text)] font-black t-italic placeholder:text-[var(--theme-text)]/30 focus:outline-none focus:border-[var(--theme-border)] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 rounded-2xl border-[length:var(--theme-bw)] border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-black t-italic uppercase tracking-tighter text-lg shadow-[var(--theme-shadow-sm)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
            >
              {loading ? 'LOGIN...' : 'Enter Platform Admin →'}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link
            href="/main/login"
            className="text-[10px] font-black text-[var(--theme-text)] opacity-40 uppercase t-italic tracking-widest hover:opacity-80"
          >
            CUSTOMER LOGIN
          </Link>
        </div>
      </div>
    </div>
  );
}
