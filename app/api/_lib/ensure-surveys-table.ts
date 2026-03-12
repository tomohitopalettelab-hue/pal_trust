import { sql } from '@vercel/postgres';

export const ensureSurveysTable = async (): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS surveys (
      id SERIAL PRIMARY KEY,
      rating INT,
      category TEXT,
      comment TEXT,
      all_answers JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS rating INT;
  `;

  await sql`
    ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS category TEXT;
  `;

  await sql`
    ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS comment TEXT;
  `;

  await sql`
    ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS all_answers JSONB;
  `;

  await sql`
    ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `;
};
