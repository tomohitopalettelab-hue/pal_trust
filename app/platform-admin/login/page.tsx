"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NoticeToast from '../../components/NoticeToast';
import { useNotice } from '../../components/useNotice';

export default function PlatformAdminLoginPage() {
  const router = useRouter();
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
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'ログインに失敗しました');
      }

      localStorage.setItem('platformAdminLoggedIn', 'true');
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
          <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none text-[var(--theme-text)]">
            Pal<span className="text-[var(--theme-primary)]">-</span>Trust
          </h1>
          <p className="text-[10px] font-black text-[var(--theme-text)] opacity-40 uppercase tracking-[0.3em] mt-3 italic">Platform Admin Login</p>
        </div>

        <div className="bg-[var(--theme-card-bg)] border-[3px] border-[var(--theme-border)] p-10 rounded-[3.5rem] shadow-[12px_12px_0px_var(--theme-border)] relative overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 rounded-full blur-[80px] opacity-20 bg-[var(--theme-primary)]" />

          <form onSubmit={handleLogin} className="relative z-10 space-y-8">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase italic mb-3 block tracking-widest">Passphrase</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--theme-text)]/10 border-2 border-[var(--theme-border)]/20 rounded-2xl px-6 py-4 text-[var(--theme-text)] font-black italic placeholder:text-[var(--theme-text)]/30 focus:outline-none focus:border-[var(--theme-border)] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 rounded-2xl border-[3px] border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-black italic uppercase tracking-tighter text-lg shadow-[4px_4px_0px_var(--theme-border)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
            >
              {loading ? 'LOGIN...' : 'Enter Platform Admin →'}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link
            href="/main/login"
            className="text-[10px] font-black text-[var(--theme-text)] opacity-40 uppercase italic tracking-widest hover:opacity-80"
          >
            CUSTOMER LOGIN
          </Link>
        </div>
      </div>
    </div>
  );
}
