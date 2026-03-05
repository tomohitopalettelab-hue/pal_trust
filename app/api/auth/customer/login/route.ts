import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { palDbPost } from '@/app/api/_lib/pal-db-client';
import { findTrustAccountByPaletteId } from '@/app/api/_lib/pal-trust-accounts';

const DEFAULT_SETTINGS = {
  settings: {
    appName: 'PAL-TRUST',
    appSubtitle: 'SURVEY',
    themeName: 'standard',
    minStarsForGoogle: '4',
    aiReviewLength: '150',
    aiReviewTaste: 'friendly',
    aiReplyTaste: 'professional',
    thanksPageContent: '本日はご来店ありがとうございました！またのお越しを心よりお待ちしております。',
    lowRatingMessage: 'ご不便をおかけし申し訳ございません。いただいた内容は責任を持って店長へ報告し、サービスの改善に努めさせていただきます。',
    googleMapUrl: 'https://goo.gl/maps/xxxx',
  },
  surveyItems: [
    { id: 1, text: '接客の満足度はどうでしたか？', type: 'rating' },
    { id: 2, text: '具体的に良かった点や改善点を教えてください', type: 'free' },
  ],
};

async function ensureTrustCustomerTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_accounts (
      customer_id TEXT PRIMARY KEY,
      customer_name TEXT,
      main_page_path TEXT,
      password_hash TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    ALTER TABLE customer_accounts
    ADD COLUMN IF NOT EXISTS customer_name TEXT;
  `;

  await sql`
    ALTER TABLE customer_accounts
    ADD COLUMN IF NOT EXISTS main_page_path TEXT;
  `;

  await sql`
    ALTER TABLE customer_accounts
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS customer_app_settings (
      customer_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

async function syncTrustCustomerProfile(customerId: string, customerName: string, isActive: boolean) {
  const normalizedCustomerId = String(customerId || '').trim().toUpperCase();
  const normalizedName = String(customerName || '').trim();

  await ensureTrustCustomerTables();

  await sql`
    INSERT INTO customer_accounts (customer_id, customer_name, main_page_path, password_hash, is_active, updated_at)
    VALUES (${normalizedCustomerId}, ${normalizedName}, ${`/main?customerId=${encodeURIComponent(normalizedCustomerId)}`}, ${''}, ${isActive}, NOW())
    ON CONFLICT (customer_id)
    DO UPDATE SET
      customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), customer_accounts.customer_name),
      main_page_path = EXCLUDED.main_page_path,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();
  `;

  await sql`
    INSERT INTO customer_app_settings (customer_id, data, updated_at)
    VALUES (${normalizedCustomerId}, ${JSON.stringify(DEFAULT_SETTINGS)}, NOW())
    ON CONFLICT (customer_id) DO NOTHING;
  `;
}

export async function POST(request: Request) {
  try {
    const { customerId, password } = await request.json();
    const loginId = String(customerId || '').trim().toUpperCase();
    const loginPassword = String(password || '');

    if (!loginId || !loginPassword) {
      return NextResponse.json({ error: '顧客IDとパスワードは必須です' }, { status: 400 });
    }

    const verifyResponse = await palDbPost('/api/chat-auth/verify', {
      loginId,
      password: loginPassword,
    });
    const verifyData = await verifyResponse.json().catch(() => ({}));

    if (!verifyResponse.ok || verifyData?.success === false) {
      return NextResponse.json({ error: 'IDまたはパスワードが正しくありません' }, { status: 401 });
    }

    const paletteId = String(verifyData?.paletteId || loginId).trim().toUpperCase();
    const trustAccount = await findTrustAccountByPaletteId(paletteId);
    if (!trustAccount) {
      return NextResponse.json({ error: 'Pal Trust契約が有効な顧客のみログインできます' }, { status: 403 });
    }

    if (String(trustAccount.status || '').toLowerCase() !== 'active') {
      return NextResponse.json({ error: 'このアカウントは停止中です' }, { status: 403 });
    }

    await syncTrustCustomerProfile(
      paletteId,
      String(trustAccount.name || verifyData?.accountName || ''),
      true,
    );

    return NextResponse.json({ ok: true, customerId: paletteId });
  } catch (error) {
    console.error('customer login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 });
  }
}
