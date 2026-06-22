export default function RootPage() {
  return (
    <div className="min-h-screen bg-[var(--theme-bg)] flex items-center justify-center p-6 font-sans">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.svg" alt="" className="w-24 h-24 mx-auto mb-6 -rotate-3" />
        <h1 className="text-5xl font-black t-italic tracking-tighter uppercase leading-none text-[var(--theme-text)]">
          Pal<span className="text-[var(--theme-primary)]">-</span>Trust
        </h1>
        <p className="text-[10px] font-black text-[var(--theme-text)] opacity-40 uppercase tracking-[0.3em] mt-3 t-italic">Review Management System</p>
        <div className="mt-10 flex flex-col gap-4">
          <a href="/main/login" className="px-8 py-4 rounded-2xl border-[length:var(--theme-bw)] border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-black t-italic uppercase tracking-tighter shadow-[var(--theme-shadow-sm)] active:translate-y-1 active:shadow-none transition-all">
            Customer Login
          </a>
          <a href="/platform-admin/login" className="px-8 py-4 rounded-2xl border-[length:var(--theme-bw)] border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] font-black t-italic uppercase tracking-tighter shadow-[var(--theme-shadow-sm)] active:translate-y-1 active:shadow-none transition-all">
            Platform Admin
          </a>
        </div>
      </div>
    </div>
  );
}
