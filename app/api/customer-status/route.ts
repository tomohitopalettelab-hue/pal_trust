import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_accounts (
      customer_id TEXT PRIMARY KEY,
      customer_name TEXT,
      main_page_path TEXT,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    ALTER TABLE customer_accounts
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  `;
}

export async function GET(request: Request) {
  try {
    await ensureTable();

    const { searchParams } = new URL(request.url);
    const customerId = String(searchParams.get('customerId') || searchParams.get('customer') || '').trim();

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const { rows } = await sql<{ customer_id: string; is_active: boolean | null }>`
      SELECT customer_id, is_active
      FROM customer_accounts
      WHERE customer_id = ${customerId}
      LIMIT 1;
    `;

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ exists: false, isActive: false });
    }

    return NextResponse.json({
      exists: true,
      customerId: row.customer_id,
      isActive: row.is_active !== false,
    });
  } catch (error) {
    console.error('customer status error:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
