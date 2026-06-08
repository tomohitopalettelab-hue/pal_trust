import { NextResponse } from 'next/server';
import { verifyCrmLogin, listCrmCustomers } from '@/app/api/_lib/palette-crm-client';

export async function POST(request: Request) {
  try {
    const { loginId, password } = await request.json();

    if (!loginId || !password) {
      return NextResponse.json({ error: 'ログインIDとパスワードを入力してください' }, { status: 400 });
    }

    // --- 0. 管理者チェック ---
    const adminId = process.env.PLATFORM_ADMIN_LOGIN_ID || 'tomohito0108';
    // NEXT_PUBLIC_* はクライアント露出するため使わない。未設定なら空→ログイン不可(fail-closed)。
    const adminPw = process.env.PLATFORM_ADMIN_PASSWORD || '';
    if (loginId === adminId && adminPw && password === adminPw) {
      return NextResponse.json({
        ok: true,
        role: 'admin',
        paletteId: '',
        accountId: '',
        accountName: '管理者',
      });
    }

    // --- 1. palette_crm で認証 ---
    const matched = await verifyCrmLogin(loginId, password);
    if (!matched) {
      return NextResponse.json({ error: 'ログインIDまたはパスワードが正しくありません' }, { status: 401 });
    }

    // --- 2. 代理店チェック（他の顧客のagencyIdに設定されている）---
    const allCustomers = await listCrmCustomers();
    const isAgency = allCustomers.some((c) => c.agencyId === matched.id);

    if (!isAgency) {
      return NextResponse.json({ error: '代理店として登録されている方のみログインできます' }, { status: 403 });
    }

    // --- 3. ログイン成功（代理店） ---
    return NextResponse.json({
      ok: true,
      role: 'agency',
      paletteId: matched.loginId || '',
      accountId: matched.id || '',
      accountName: matched.companyName || matched.contactName || '',
    });
  } catch (error) {
    console.error('platform-admin login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 });
  }
}
