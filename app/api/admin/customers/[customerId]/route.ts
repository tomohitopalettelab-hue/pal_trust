import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { findTrustAccountByCustomerId } from '@/app/api/_lib/pal-trust-accounts';
import { palDbPost } from '@/app/api/_lib/pal-db-client';
import { ensureSurveysTable } from '@/app/api/_lib/ensure-surveys-table';

type AccountRow = {
  customer_id: string;
  customer_name: string | null;
  main_page_path: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

type SettingRow = {
  data: {
    settings?: Record<string, unknown>;
    surveyItems?: Array<{ id: number; text: string; type: string }>;
  };
  updated_at: string;
};

type SurveyRow = {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
};

async function ensureTables() {
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

  await ensureSurveysTable();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    await ensureTables();

    const { customerId: rawCustomerId } = await params;
    const customerId = decodeURIComponent(rawCustomerId || '').trim();

    if (!customerId) {
      return NextResponse.json({ error: 'customerIdは必須です' }, { status: 400 });
    }

    const trustAccount = await findTrustAccountByCustomerId(customerId);
    if (!trustAccount) {
      return NextResponse.json({ error: 'Pal Trust契約顧客が見つかりません' }, { status: 404 });
    }

    const canonicalCustomerId = String(trustAccount.paletteId || '').trim().toUpperCase();
    const canonicalCustomerName = String(trustAccount.name || '').trim();
    const canonicalIsActive = String(trustAccount.status || '').toLowerCase() === 'active';

    await sql`
      INSERT INTO customer_accounts (customer_id, customer_name, main_page_path, password_hash, is_active, updated_at)
      VALUES (${canonicalCustomerId}, ${canonicalCustomerName}, ${`/main?customerId=${encodeURIComponent(canonicalCustomerId)}`}, ${''}, ${canonicalIsActive}, NOW())
      ON CONFLICT (customer_id)
      DO UPDATE SET
        customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), customer_accounts.customer_name),
        main_page_path = EXCLUDED.main_page_path,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();
    `;

    const [{ rows: accountRows }, { rows: settingsRows }, { rows: surveyRows }] = await Promise.all([
      sql<AccountRow>`
        SELECT customer_id, customer_name, main_page_path, is_active, updated_at::text
        FROM customer_accounts
        WHERE customer_id = ${canonicalCustomerId}
        LIMIT 1;
      `,
      sql<SettingRow>`
        SELECT data, updated_at::text
        FROM customer_app_settings
        WHERE customer_id = ${canonicalCustomerId}
        LIMIT 1;
      `,
      sql<SurveyRow>`
        SELECT id, rating, comment, created_at::text
        FROM surveys
        WHERE COALESCE(NULLIF(category, ''), 'default') = ${canonicalCustomerId}
        ORDER BY created_at DESC
        LIMIT 20;
      `,
    ]);

    const account = accountRows[0] || null;
    const settings = settingsRows[0] || null;

    const surveyCount = surveyRows.length;
    const avgRating = surveyCount > 0
      ? surveyRows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / surveyCount
      : 0;

    return NextResponse.json({
      customerId: canonicalCustomerId,
      customerName: account?.customer_name || trustAccount.name || '',
      mainPagePath: account?.main_page_path || `/main?customerId=${encodeURIComponent(canonicalCustomerId)}`,
      hasPassword: Boolean(trustAccount.chatPasswordSet),
      accountUpdatedAt: trustAccount.updatedAt || account?.updated_at || null,
      settingsUpdatedAt: settings?.updated_at || null,
      settings: settings?.data?.settings || null,
      surveyItems: Array.isArray(settings?.data?.surveyItems) ? settings?.data?.surveyItems : [],
      surveyCount,
      averageRating: Number(avgRating.toFixed(2)),
      latestSurveys: surveyRows,
    });
  } catch (error) {
    console.error('customer detail api error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    await ensureTables();

    const { customerId: rawCustomerId } = await params;
    const customerId = decodeURIComponent(rawCustomerId || '').trim();
    if (!customerId) {
      return NextResponse.json({ error: 'customerIdは必須です' }, { status: 400 });
    }

    const trustAccount = await findTrustAccountByCustomerId(customerId);
    if (!trustAccount) {
      return NextResponse.json({ error: 'Pal Trust契約顧客が見つかりません' }, { status: 404 });
    }

    const body = await request.json();
    const customerName = String(body?.customerName ?? '').trim();
    const mainPagePathRaw = String(body?.mainPagePath ?? '').trim();
    const settings = body?.settings && typeof body.settings === 'object' ? body.settings : {};
    const surveyItems = Array.isArray(body?.surveyItems) ? body.surveyItems : [];

    const mainPagePath = mainPagePathRaw || `/main?customerId=${encodeURIComponent(customerId)}`;

    await sql`
      INSERT INTO customer_accounts (customer_id, customer_name, main_page_path, password_hash, updated_at)
      VALUES (${customerId}, ${customerName || trustAccount.name || ''}, ${mainPagePath}, ${''}, NOW())
      ON CONFLICT (customer_id)
      DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        main_page_path = EXCLUDED.main_page_path,
        updated_at = NOW();
    `;

    const saveRes = await palDbPost('/api/accounts', {
      id: trustAccount.id,
      paletteId: trustAccount.paletteId,
      name: customerName || trustAccount.name || '顧客名未設定',
      status: trustAccount.status || 'active',
      chatLoginId: trustAccount.chatLoginId || trustAccount.paletteId,
    });

    if (!saveRes.ok) {
      const body = await saveRes.json().catch(() => ({}));
      return NextResponse.json({ error: body?.error || 'pal_dbへの顧客名更新に失敗しました' }, { status: 500 });
    }

    const mergedData = {
      settings,
      surveyItems,
    };

    await sql`
      INSERT INTO customer_app_settings (customer_id, data, updated_at)
      VALUES (${customerId}, ${JSON.stringify(mergedData)}, NOW())
      ON CONFLICT (customer_id)
      DO UPDATE SET data = ${JSON.stringify(mergedData)}, updated_at = NOW();
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('customer detail patch error:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
