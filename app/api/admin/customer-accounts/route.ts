import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { listTrustAccountsFromPalDb, findTrustAccountByCustomerId } from '@/app/api/_lib/pal-trust-accounts';

type AccountRow = {
  customer_id: string;
  customer_name: string | null;
  main_page_path: string | null;
  created_at: string;
  updated_at: string;
};

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

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_accounts (
      customer_id TEXT PRIMARY KEY,
      customer_name TEXT,
      main_page_path TEXT,
      password_hash TEXT,
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
    CREATE TABLE IF NOT EXISTS customer_app_settings (
      customer_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS survey_funnel_events (
      session_id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      review_clicked_at TIMESTAMPTZ
    );
  `;
}

export async function GET() {
  try {
    const trustAccounts = await listTrustAccountsFromPalDb();
    return NextResponse.json(trustAccounts.map((account) => ({
      customerId: account.chatLoginId || account.paletteId,
      customerName: account.name || '',
      mainPagePath: `/main?customerId=${encodeURIComponent(account.chatLoginId || account.paletteId)}`,
      isActive: String(account.status || '').toLowerCase() === 'active',
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      hasPassword: Boolean(account.chatPasswordSet),
    })));
  } catch (error) {
    console.error('customer accounts get error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { customerId, customerName, password } = await request.json();
    const targetCustomerId = String(customerId || '').trim();

    if (!targetCustomerId || !password) {
      return NextResponse.json({ error: 'ログインIDとパスワードは必須です' }, { status: 400 });
    }

    const trustAccount = await findTrustAccountByCustomerId(targetCustomerId);
    if (!trustAccount) {
      return NextResponse.json({ error: 'Pal Trust契約中の顧客IDのみ設定できます' }, { status: 404 });
    }

    const resolvedCustomerName = String(customerName || trustAccount.name || '').trim();
    await ensureTable();

    await sql`
      INSERT INTO customer_app_settings (customer_id, data, updated_at)
      VALUES (${targetCustomerId}, ${JSON.stringify(DEFAULT_SETTINGS)}, NOW())
      ON CONFLICT (customer_id) DO NOTHING;
    `;

    await sql`
      INSERT INTO customer_accounts (customer_id, customer_name, main_page_path, updated_at)
      VALUES (${targetCustomerId}, ${resolvedCustomerName}, ${`/main?customerId=${encodeURIComponent(targetCustomerId)}`}, NOW())
      ON CONFLICT (customer_id)
      DO UPDATE SET customer_name = EXCLUDED.customer_name, main_page_path = EXCLUDED.main_page_path, updated_at = NOW();
    `;

    return NextResponse.json({ ok: true, customerId: targetCustomerId, mainPagePath: `/main?customerId=${encodeURIComponent(targetCustomerId)}` });
  } catch (error) {
    console.error('customer accounts post error:', error);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const customerId = String(body?.customerId || '').trim().toUpperCase();
    const isActive = body?.isActive;

    if (!customerId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'customerIdとisActiveは必須です' }, { status: 400 });
    }

    const trustAccount = await findTrustAccountByCustomerId(customerId);
    if (!trustAccount) {
      return NextResponse.json({ error: 'Pal Trust契約中の顧客が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('customer accounts patch error:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json({ error: 'customerIdは必須です' }, { status: 400 });
    }

    const trustAccount = await findTrustAccountByCustomerId(customerId);
    if (!trustAccount) {
      return NextResponse.json({ error: 'Pal Trust契約中の顧客が見つかりません' }, { status: 404 });
    }

    await ensureTable();
    await sql`DELETE FROM customer_app_settings WHERE customer_id = ${customerId};`;

    return NextResponse.json({ ok: true, message: '顧客を停止し、Pal Trust側設定を削除しました' });
  } catch (error) {
    console.error('customer accounts delete error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
