import { sql } from '@vercel/postgres';

export const ensureReviewRepliesTable = async (): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS pal_trust_review_replies (
      id TEXT PRIMARY KEY,
      palette_id TEXT NOT NULL,
      review_id TEXT NOT NULL UNIQUE,
      review_text TEXT,
      review_rating INT,
      reply_text TEXT NOT NULL,
      replied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS pal_trust_review_replies_palette_id_idx
    ON pal_trust_review_replies (palette_id);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS pal_trust_review_replies_replied_at_idx
    ON pal_trust_review_replies (replied_at DESC);
  `;
};
