import { sql } from '@vercel/postgres';

export async function ensureLineFriendsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS line_friends (
      id SERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL,
      line_user_id TEXT NOT NULL,
      display_name TEXT,
      status TEXT DEFAULT 'active',
      added_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(customer_id, line_user_id)
    );
  `;
}
