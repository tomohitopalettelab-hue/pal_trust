import { NextResponse } from 'next/server';
import { palDbPost, palDbGet } from '@/app/api/_lib/pal-db-client';

export async function POST(request: Request) {
  try {
    const { loginId, password } = await request.json();

    if (!loginId || !password) {
      return NextResponse.json({ error: 'ログインIDとパスワードを入力してください' }, { status: 400 });
    }

    // --- 1. pal_db (palette_canvas) でログイン認証 ---
    const verifyRes = await palDbPost('/api/chat-auth/verify', { loginId, password });
    const verifyData = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok || verifyData?.success === false) {
      return NextResponse.json({ error: 'ログインIDまたはパスワードが正しくありません' }, { status: 401 });
    }

    const paletteId = String(verifyData?.paletteId || '').trim().toUpperCase();
    if (!paletteId) {
      return NextResponse.json({ error: '認証情報の取得に失敗しました' }, { status: 500 });
    }

    // --- 2. 契約情報を取得して agency + pal_trust を確認 ---
    const summaryRes = await palDbGet(`/api/palette-summary?paletteId=${encodeURIComponent(paletteId)}`);
    const summary = await summaryRes.json().catch(() => ({}));

    const contracts: any[] = Array.isArray(summary?.contracts) ? summary.contracts : [];
    const plans: any[] = Array.isArray(summary?.plans) ? summary.plans : [];
    const planMap = new Map<string, any>(plans.map((p: any) => [String(p.id), p]));

    let hasAgency = false;
    let hasPalTrust = false;

    for (const contract of contracts) {
      const plan = planMap.get(String(contract.planId));
      if (!plan) continue;
      const code = String(plan.code || '').toLowerCase().replace(/-/g, '_');
      if (code === 'agency' || code.startsWith('agency_')) hasAgency = true;
      if (code.includes('pal_trust') || code === 'trust' || code.startsWith('trust_')) hasPalTrust = true;
    }

    if (!hasAgency || !hasPalTrust) {
      return NextResponse.json({ error: '代理店かつPal Trust契約がある方のみログインできます' }, { status: 403 });
    }

    // --- 3. ログイン成功：代理店情報を返す ---
    const accountId = summary?.account?.id || '';
    const accountName = summary?.account?.name || '';

    return NextResponse.json({
      ok: true,
      paletteId,
      accountId,
      accountName,
    });
  } catch (error) {
    console.error('platform-admin login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 });
  }
}
