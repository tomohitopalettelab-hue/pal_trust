import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

type ListRow = {
  customer_id: string;
  customer_name: string | null;
  main_page_path: string | null;
  is_active: boolean | null;
  has_password: boolean;
  created_at: string | null;
  updated_at: string | null;
  survey_count: number;
  avg_rating: string | number | null;
  last_response_at: string | null;
  settings_data: {
    settings?: Record<string, unknown>;
    surveyItems?: unknown[];
  } | null;
};

async function ensureTables() {
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
}

export async function GET() {
  try {
    await ensureTables();

    const { rows } = await sql<ListRow>`
      WITH ids AS (
        SELECT customer_id FROM customer_accounts
        UNION
        SELECT customer_id FROM customer_app_settings
        UNION
        SELECT COALESCE(NULLIF(category, ''), 'default') AS customer_id FROM surveys
      ),
      surveys_agg AS (
        SELECT
          COALESCE(NULLIF(category, ''), 'default') AS customer_id,
          COUNT(*)::int AS survey_count,
          ROUND(AVG(rating)::numeric, 2) AS avg_rating,
          MAX(created_at)::text AS last_response_at
        FROM surveys
        GROUP BY 1
      )
      SELECT
        ids.customer_id,
        accounts.customer_name,
        accounts.main_page_path,
        accounts.is_active,
        (accounts.password_hash IS NOT NULL) AS has_password,
        accounts.created_at::text AS created_at,
        accounts.updated_at::text AS updated_at,
        COALESCE(agg.survey_count, 0)::int AS survey_count,
        agg.avg_rating,
        agg.last_response_at,
        settings.data AS settings_data
      FROM ids
      LEFT JOIN customer_accounts accounts ON accounts.customer_id = ids.customer_id
      LEFT JOIN customer_app_settings settings ON settings.customer_id = ids.customer_id
      LEFT JOIN surveys_agg agg ON agg.customer_id = ids.customer_id
      ORDER BY accounts.created_at DESC NULLS LAST, accounts.updated_at DESC NULLS LAST, ids.customer_id ASC;
    `;

    const normalized = rows.map((row) => {
      const settings = row.settings_data?.settings || null;
      const surveyItems = Array.isArray(row.settings_data?.surveyItems)
        ? row.settings_data?.surveyItems
        : [];

      return {
        customerId: row.customer_id,
        customerName: row.customer_name || '',
        mainPagePath: row.main_page_path || `/main?customerId=${encodeURIComponent(row.customer_id)}`,
        isActive: row.is_active !== false,
        hasPassword: Boolean(row.has_password),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        surveyCount: Number(row.survey_count || 0),
        averageRating: row.avg_rating === null ? 0 : Number(row.avg_rating),
        lastResponseAt: row.last_response_at,
        currentSettings: settings,
        surveyItems,
      };
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('customers list error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
