import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_app_settings (
      customer_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

export async function GET(request: Request) {
  try {
    await ensureTable();

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || searchParams.get('customer') || 'default';

    const { rows } = await sql`
      SELECT data
      FROM customer_app_settings
      WHERE customer_id = ${customerId}
      LIMIT 1;
    `;

    return NextResponse.json(rows[0]?.data || null);
  } catch {
    return NextResponse.json({ error: '取得失敗' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const customerId = body?.customerId || 'default';
    await ensureTable();

    await sql`
      INSERT INTO customer_app_settings (customer_id, data, updated_at)
      VALUES (${String(customerId)}, ${JSON.stringify(body)}, CURRENT_TIMESTAMP)
      ON CONFLICT (customer_id)
      DO UPDATE SET data = ${JSON.stringify(body)}, updated_at = CURRENT_TIMESTAMP;
    `;

    return NextResponse.json({ message: '保存成功' });
  } catch {
    return NextResponse.json({ error: '保存失敗' }, { status: 500 });
  }
}