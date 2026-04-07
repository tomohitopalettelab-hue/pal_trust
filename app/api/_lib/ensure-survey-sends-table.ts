import { sql } from '@vercel/postgres';

export async function ensureSurveySendsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS survey_sends (
      id SERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_survey_sends_monthly
    ON survey_sends (customer_id, channel, sent_at);
  `;
}
