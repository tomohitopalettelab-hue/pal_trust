import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { loginId, password } = await request.json();

    if (!loginId || !password) {
      return NextResponse.json({ error: 'ログインIDとパスワードを入力してください' }, { status: 400 });
    }

    // --- 1. palette_crm から全顧客を取得 ---
    const canvasUrl = process.env.PALETTE_CANVAS_URL || 'https://palettecrm.vercel.app';
    const crmRes = await fetch(`${canvasUrl}/api/crm/customers`, { cache: 'no-store' });
    const crmData = await crmRes.json().catch(() => ({ data: [] }));
    const customers: any[] = Array.isArray(crmData?.data) ? crmData.data : [];

    // --- 2. loginId/passwordで照合 ---
    const matched = customers.find(
      (c: any) =>
        String(c.loginId || '') === loginId &&
        String(c.loginPassword || '') === password
    );

    if (!matched) {
      return NextResponse.json({ error: 'ログインIDまたはパスワードが正しくありません' }, { status: 401 });
    }

    // --- 3. この顧客が「代理店」かつ「pal_trust契約あり」かチェック ---
    // 代理店 = 他の顧客のagencyIdとして設定されている
    const isAgency = customers.some((c: any) => c.agencyId === matched.id);

    // pal_trust契約チェック: pal_dbのcontractsから確認
    const { palDbGet } = await import('@/app/api/_lib/pal-db-client');
    const [contractsRes, plansRes] = await Promise.all([
      palDbGet(`/api/contracts`),
      palDbGet('/api/plans?includeInactive=1'),
    ]);
    const contractsBody = await contractsRes.json().catch(() => ({}));
    const plansBody = await plansRes.json().catch(() => ({}));
    const contracts: any[] = Array.isArray(contractsBody?.contracts) ? contractsBody.contracts : [];
    const plans: any[] = Array.isArray(plansBody?.plans) ? plansBody.plans : [];

    const palTrustPlanIds = new Set(
      plans
        .filter((p: any) => {
          const code = String(p.code || '').toLowerCase().replace(/-/g, '_');
          return code.includes('pal_trust') || code === 'trust' || code.startsWith('trust_');
        })
        .map((p: any) => String(p.id))
    );

    // matched.loginId（= paletteId相当）でaccountsからaccountIdを特定
    const accountsRes = await palDbGet('/api/accounts');
    const accountsBody = await accountsRes.json().catch(() => ({}));
    const accounts: any[] = Array.isArray(accountsBody?.accounts) ? accountsBody.accounts : [];
    const matchedAccount = accounts.find(
      (a: any) => String(a.paletteId || '').toUpperCase() === String(matched.loginId || '').toUpperCase()
        || String(a.chatLoginId || '') === String(matched.loginId || '')
    );

    const hasPalTrust = matchedAccount
      ? contracts.some(
          (c: any) => String(c.accountId) === String(matchedAccount.id) && palTrustPlanIds.has(String(c.planId))
        )
      : false;

    if (!isAgency || !hasPalTrust) {
      return NextResponse.json({ error: '代理店かつPal Trust契約がある方のみログインできます' }, { status: 403 });
    }

    // --- 4. ログイン成功 ---
    return NextResponse.json({
      ok: true,
      paletteId: matched.loginId || '',
      accountId: matched.id || '',
      accountName: matched.companyName || matched.contactName || '',
    });
  } catch (error) {
    console.error('platform-admin login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 });
  }
}
