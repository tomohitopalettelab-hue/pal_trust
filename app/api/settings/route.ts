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

    // 大文字小文字を区別せず、完全一致を最優先・次に最終更新が新しいものを返す
    // （重複レコードがあっても常に最新を返すことで「保存後にリセット」を防ぐ）
    const { rows } = await sql`
      SELECT data
      FROM customer_app_settings
      WHERE LOWER(customer_id) = LOWER(${customerId})
      ORDER BY (customer_id = ${customerId}) DESC, updated_at DESC
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
    const customerId = String(body?.customerId || 'default');
    await ensureTable();

    // 大文字小文字違いの重複レコードがあると「保存後リセット」の原因になるため、
    // 保存対象以外の同名（case-insensitive）レコードを先に削除して統合する
    await sql`
      DELETE FROM customer_app_settings
      WHERE LOWER(customer_id) = LOWER(${customerId})
        AND customer_id <> ${customerId};
    `;

    await sql`
      INSERT INTO customer_app_settings (customer_id, data, updated_at)
      VALUES (${customerId}, ${JSON.stringify(body)}, CURRENT_TIMESTAMP)
      ON CONFLICT (customer_id)
      DO UPDATE SET data = ${JSON.stringify(body)}, updated_at = CURRENT_TIMESTAMP;
    `;

    return NextResponse.json({ message: '保存成功' });
  } catch {
    return NextResponse.json({ error: '保存失敗' }, { status: 500 });
  }
}
