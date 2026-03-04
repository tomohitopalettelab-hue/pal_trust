import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/password';

type AccountRow = {
  customer_id: string;
  password_hash: string;
  is_active: boolean | null;
};

export async function POST(request: Request) {
  try {
    const { customerId, password } = await request.json();

    if (!customerId || !password) {
      return NextResponse.json({ error: '顧客IDとパスワードは必須です' }, { status: 400 });
    }

    await sql`
      CREATE TABLE IF NOT EXISTS customer_accounts (
        customer_id TEXT PRIMARY KEY,
        customer_name TEXT,
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
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    `;

    const { rows } = await sql<AccountRow>`
      SELECT customer_id, password_hash, is_active
      FROM customer_accounts
      WHERE customer_id = ${String(customerId)}
      LIMIT 1;
    `;

    const account = rows[0];
    if (!account) {
      return NextResponse.json({ error: 'IDまたはパスワードが正しくありません' }, { status: 401 });
    }

    if (account.is_active === false) {
      return NextResponse.json({ error: 'このアカウントは停止中です' }, { status: 403 });
    }

    const ok = verifyPassword(String(password), account.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'IDまたはパスワードが正しくありません' }, { status: 401 });
    }

    return NextResponse.json({ ok: true, customerId: account.customer_id });
  } catch (error) {
    console.error('customer login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 });
  }
}
