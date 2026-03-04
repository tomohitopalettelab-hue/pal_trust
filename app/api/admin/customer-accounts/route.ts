import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/password';

type AccountRow = {
  customer_id: string;
  customer_name: string | null;
  main_page_path: string | null;
  is_active: boolean | null;
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

function generateCustomerId(customerName?: string) {
  const base = (customerName || 'customer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24) || 'customer';

  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_accounts (
      customer_id TEXT PRIMARY KEY,
      customer_name TEXT,
      main_page_path TEXT,
      password_hash TEXT NOT NULL,
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
    await ensureTable();
    const { rows } = await sql<AccountRow>`
      SELECT customer_id, customer_name, main_page_path, is_active, created_at::text, updated_at::text
      FROM customer_accounts
      ORDER BY updated_at DESC;
    `;

    return NextResponse.json(rows.map((row) => ({
      customerId: row.customer_id,
      customerName: row.customer_name || '',
      mainPagePath: row.main_page_path || `/main?customerId=${encodeURIComponent(row.customer_id)}`,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    console.error('customer accounts get error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { customerId, customerName, password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'パスワードは必須です' }, { status: 400 });
    }

    await ensureTable();

    const resolvedCustomerId = String(customerId || '').trim() || generateCustomerId(String(customerName || ''));
    const mainPagePath = `/main?customerId=${encodeURIComponent(resolvedCustomerId)}`;

    const passwordHash = hashPassword(String(password));

    await sql`
      INSERT INTO customer_accounts (customer_id, customer_name, password_hash, updated_at)
      VALUES (${resolvedCustomerId}, ${String(customerName || '')}, ${passwordHash}, NOW())
      ON CONFLICT (customer_id)
      DO UPDATE SET
        customer_name = ${String(customerName || '')},
        password_hash = ${passwordHash},
        main_page_path = ${mainPagePath},
        updated_at = NOW();
    `;

    await sql`
      UPDATE customer_accounts
      SET main_page_path = ${mainPagePath}
      WHERE customer_id = ${resolvedCustomerId} AND (main_page_path IS NULL OR main_page_path = '');
    `;

    await sql`
      INSERT INTO customer_app_settings (customer_id, data, updated_at)
      VALUES (${resolvedCustomerId}, ${JSON.stringify(DEFAULT_SETTINGS)}, NOW())
      ON CONFLICT (customer_id) DO NOTHING;
    `;

    return NextResponse.json({ ok: true, customerId: resolvedCustomerId, mainPagePath });
  } catch (error) {
    console.error('customer accounts post error:', error);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const customerId = String(body?.customerId || '').trim();
    const isActive = body?.isActive;

    if (!customerId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'customerIdとisActiveは必須です' }, { status: 400 });
    }

    await ensureTable();

    await sql`
      UPDATE customer_accounts
      SET is_active = ${isActive}, updated_at = NOW()
      WHERE customer_id = ${customerId};
    `;

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

    await ensureTable();

    await sql`DELETE FROM customer_accounts WHERE customer_id = ${customerId};`;
    await sql`DELETE FROM customer_app_settings WHERE customer_id = ${customerId};`;
    await sql`DELETE FROM surveys WHERE COALESCE(NULLIF(category, ''), 'default') = ${customerId};`;
    await sql`DELETE FROM survey_funnel_events WHERE customer_id = ${customerId};`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('customer accounts delete error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
